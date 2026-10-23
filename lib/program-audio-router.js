/**
 * Isolates each incoming caller's audio and exposes a single program stream.
 *
 * Monitor audio and program audio are independent routes. Program switching is
 * fail-closed: all program gains are muted before the selected caller is enabled.
 * This module never routes waiting/held/screening callers unless the dashboard
 * explicitly selects their call ID.
 */
export class ProgramAudioRouter {
  constructor({
    audioContext = new (window.AudioContext || window.webkitAudioContext)(),
    programDestination = audioContext.createMediaStreamDestination(),
    monitorDestination = audioContext.destination,
    gainValue = 1
  } = {}) {
    if (!audioContext || typeof audioContext.createMediaStreamSource !== 'function') {
      throw new TypeError('A Web Audio AudioContext is required');
    }
    if (!programDestination || !programDestination.stream) {
      throw new TypeError('A MediaStreamAudioDestinationNode is required for program audio');
    }
    this.context = audioContext;
    this.programDestination = programDestination;
    this.monitorDestination = monitorDestination;
    this.gainValue = gainValue;
    this.calls = new Map();
    this.programCallId = null;
    this.monitorCallId = null;
    this.closed = false;
  }

  registerCall(callId) {
    this.#assertOpen();
    this.#assertCallId(callId);
    if (this.calls.has(callId)) throw new Error(`Call already registered: ${callId}`);
    const programGain = this.context.createGain();
    const monitorGain = this.context.createGain();
    programGain.gain.value = 0;
    monitorGain.gain.value = 0;
    programGain.connect(this.programDestination);
    monitorGain.connect(this.monitorDestination);
    this.calls.set(callId, { callId, source: null, track: null, programGain, monitorGain });
    return this.getCall(callId);
  }

  attachTrack(callId, track) {
    this.#assertOpen();
    const call = this.#requireCall(callId);
    if (!track || track.kind !== 'audio') throw new TypeError('An incoming audio track is required');
    this.#detachTrack(call);
    const stream = new MediaStream([track]);
    call.source = this.context.createMediaStreamSource(stream);
    call.source.connect(call.programGain);
    call.source.connect(call.monitorGain);
    call.track = track;
    return this.getCall(callId);
  }

  setProgramCall(callId) {
    this.#assertOpen();

    // Fail closed before validating/opening the new route. If selection is stale
    // or the track disappeared, silence is safer than leaving the prior caller live.
    this.#setAllGains('programGain', 0);
    this.programCallId = null;
    if (callId === null) return null;

    const next = this.#requireCall(callId);
    if (!next.track || next.track.readyState === 'ended') {
      throw new Error('Selected caller has no live incoming audio track');
    }
    next.programGain.gain.value = this.gainValue;
    this.programCallId = callId;
    return callId;
  }

  setMonitorCall(callId) {
    this.#assertOpen();

    // Match program routing's fail-closed behavior: clear the prior monitor
    // before validating a new selection, so stale/ended tracks cannot remain audible.
    this.#setAllGains('monitorGain', 0);
    this.monitorCallId = null;
    if (callId === null) return null;

    const next = this.#requireCall(callId);
    if (!next.track || next.track.readyState === 'ended') {
      throw new Error('Selected monitor caller has no live incoming audio track');
    }
    next.monitorGain.gain.value = this.gainValue;
    this.monitorCallId = callId;
    return callId;
  }

  removeCall(callId) {
    this.#assertOpen();
    const call = this.calls.get(callId);
    if (!call) return false;
    if (this.programCallId === callId) this.setProgramCall(null);
    if (this.monitorCallId === callId) this.setMonitorCall(null);
    this.#detachTrack(call);
    try { call.programGain.disconnect(); } catch {}
    try { call.monitorGain.disconnect(); } catch {}
    this.calls.delete(callId);
    return true;
  }

  getCall(callId) {
    const call = this.calls.get(callId);
    if (!call) return null;
    return {
      callId,
      hasAudioTrack: !!call.track && call.track.readyState !== 'ended',
      programGain: call.programGain.gain.value,
      monitorGain: call.monitorGain.gain.value
    };
  }

  getProgramStream() {
    this.#assertOpen();
    return this.programDestination.stream;
  }

  close() {
    if (this.closed) return;
    // Silence all caller routes before releasing nodes.
    this.#setAllGains('programGain', 0);
    this.#setAllGains('monitorGain', 0);
    this.programCallId = null;
    this.monitorCallId = null;
    for (const call of this.calls.values()) {
      this.#detachTrack(call);
      try { call.programGain.disconnect(); } catch {}
      try { call.monitorGain.disconnect(); } catch {}
    }
    this.calls.clear();
    this.closed = true;
  }

  #setAllGains(key, value) {
    for (const call of this.calls.values()) call[key].gain.value = value;
  }

  #detachTrack(call) {
    if (call.source) {
      try { call.source.disconnect(); } catch {}
      call.source = null;
    }
    call.track = null;
  }

  #requireCall(callId) {
    const call = this.calls.get(callId);
    if (!call) throw new Error(`Call is not registered: ${callId}`);
    return call;
  }

  #assertCallId(callId) {
    if (typeof callId !== 'string' || !callId.trim()) throw new TypeError('callId is required');
  }

  #assertOpen() {
    if (this.closed) throw new Error('Program audio router is closed');
  }
}
