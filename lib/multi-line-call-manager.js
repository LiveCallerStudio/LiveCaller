/**
 * Three-line call-state and broadcast-routing coordinator.
 *
 * This module deliberately does not create WebRTC peers or read Firestore.
 * The dashboard supplies those adapters. It enforces one program caller at
 * a time and fails closed (program audio is disconnected) before switching.
 */
export const CALL_LINE_IDS = Object.freeze([1, 2, 3]);
export const CALL_STATE = Object.freeze({
  WAITING: 'waiting',
  SCREENING: 'screening',
  CONNECTED: 'connected',
  HELD: 'held',
  ON_AIR: 'on-air',
  ENDED: 'ended'
});

const LIVE_STATES = new Set([
  CALL_STATE.WAITING, CALL_STATE.SCREENING, CALL_STATE.CONNECTED,
  CALL_STATE.HELD, CALL_STATE.ON_AIR
]);

export class MultiLineCallManager {
  constructor({ routeToProgram = () => {}, setHoldAudio = () => {}, closeCall = () => {} } = {}) {
    this.adapters = { routeToProgram, setHoldAudio, closeCall };
    this.lines = new Map(CALL_LINE_IDS.map(lineId => [lineId, null]));
    this.programCallId = null;
  }

  registerCall({ callId, callerName = 'Caller', mediaType = 'audio', lineId } = {}) {
    if (typeof callId !== 'string' || !callId.trim()) throw new TypeError('callId is required');
    if ([...this.lines.values()].some(call => call?.callId === callId)) {
      throw new Error(`Call already registered: ${callId}`);
    }
    const targetLine = lineId ?? CALL_LINE_IDS.find(id => this.lines.get(id) === null);
    if (targetLine === undefined) throw new Error('All three call lines are occupied');
    if (!CALL_LINE_IDS.includes(targetLine)) throw new RangeError('lineId must be 1, 2, or 3');
    if (this.lines.get(targetLine)) throw new Error(`Line ${targetLine} is occupied`);
    const call = { callId, callerName, mediaType, lineId: targetLine, state: CALL_STATE.WAITING };
    this.lines.set(targetLine, call);
    return { ...call };
  }

  getCall(lineId) {
    this.#assertLine(lineId);
    const call = this.lines.get(lineId);
    return call ? { ...call } : null;
  }

  getSnapshot() {
    return {
      programCallId: this.programCallId,
      lines: CALL_LINE_IDS.map(lineId => {
        const call = this.lines.get(lineId);
        return call ? { ...call } : { lineId, callId: null, state: 'empty' };
      })
    };
  }

  setScreening(lineId) {
    const call = this.#requireCall(lineId);
    this.#assertTransition(call, [CALL_STATE.WAITING, CALL_STATE.SCREENING]);
    call.state = CALL_STATE.SCREENING;
    return { ...call };
  }

  markConnected(lineId) {
    const call = this.#requireCall(lineId);
    this.#assertTransition(call, [
      CALL_STATE.WAITING, CALL_STATE.SCREENING, CALL_STATE.HELD, CALL_STATE.CONNECTED
    ]);
    call.state = CALL_STATE.CONNECTED;
    return { ...call };
  }

  hold(lineId) {
    const call = this.#requireCall(lineId);
    if (![CALL_STATE.CONNECTED, CALL_STATE.ON_AIR, CALL_STATE.HELD].includes(call.state)) {
      throw new Error('Only a connected call can be held');
    }
    if (call.state === CALL_STATE.ON_AIR) {
      // Break the program route before enabling hold audio.
      this.adapters.routeToProgram(null);
      this.programCallId = null;
    }
    this.adapters.setHoldAudio(call.callId, true);
    call.state = CALL_STATE.HELD;
    return { ...call };
  }

  resume(lineId) {
    const call = this.#requireCall(lineId);
    this.#assertTransition(call, [CALL_STATE.HELD]);
    this.adapters.setHoldAudio(call.callId, false);
    call.state = CALL_STATE.CONNECTED;
    return { ...call };
  }

  takeOnAir(lineId) {
    const next = this.#requireCall(lineId);
    if (![CALL_STATE.CONNECTED, CALL_STATE.HELD, CALL_STATE.ON_AIR].includes(next.state)) {
      throw new Error('Call must be connected before going on-air');
    }
    if (this.programCallId === next.callId) return { ...next };

    // Safety first: disconnect the previous program caller before changing any
    // hold state or connecting the next caller to the program output.
    const previous = this.programCallId
      ? [...this.lines.values()].find(call => call?.callId === this.programCallId)
      : null;
    this.adapters.routeToProgram(null);
    this.programCallId = null;

    if (previous && previous.callId !== next.callId) {
      this.adapters.setHoldAudio(previous.callId, true);
      previous.state = CALL_STATE.HELD;
    }

    try {
      this.adapters.setHoldAudio(next.callId, false);
      this.adapters.routeToProgram(next.callId);
    } catch (error) {
      // A route adapter can reject a stale track or fail during connection.
      // Best-effort rollback keeps the program silent and the attempted caller
      // in a held state rather than claiming it is on-air.
      try { this.adapters.routeToProgram(null); } catch {}
      try { this.adapters.setHoldAudio(next.callId, true); } catch {}
      this.programCallId = null;
      next.state = CALL_STATE.HELD;
      throw error;
    }
    this.programCallId = next.callId;
    next.state = CALL_STATE.ON_AIR;
    return { ...next };
  }

  endCall(lineId) {
    const call = this.#requireCall(lineId);
    if (this.programCallId === call.callId) {
      this.adapters.routeToProgram(null);
      this.programCallId = null;
    }
    this.adapters.setHoldAudio(call.callId, false);
    this.adapters.closeCall(call.callId);
    this.lines.set(lineId, null);
    return { ...call, state: CALL_STATE.ENDED };
  }

  #assertLine(lineId) {
    if (!CALL_LINE_IDS.includes(lineId)) throw new RangeError('lineId must be 1, 2, or 3');
  }

  #requireCall(lineId) {
    this.#assertLine(lineId);
    const call = this.lines.get(lineId);
    if (!call || !LIVE_STATES.has(call.state)) throw new Error(`Line ${lineId} has no live call`);
    return call;
  }

  #assertTransition(call, allowed) {
    if (!allowed.includes(call.state)) {
      throw new Error(`Cannot transition call from ${call.state}`);
    }
  }
}
