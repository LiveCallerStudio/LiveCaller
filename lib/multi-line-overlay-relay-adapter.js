import { MultiLineOverlayRelayBridge } from './multi-line-overlay-relay-bridge.js';

/**
 * Firestore/WebRTC lifecycle adapter for experimental audio-only OBS relays.
 * It is deliberately separate from the legacy active-call relay globals.
 */
export class MultiLineOverlayRelayAdapter {
  constructor({
    db, controller, doc, setDoc, collection, addDoc, onSnapshot, iceConfig = [],
    RTCPeerConnection: PeerConnection = globalThis.RTCPeerConnection,
    RTCIceCandidate: IceCandidate = globalThis.RTCIceCandidate,
    RTCSessionDescription: SessionDescription = globalThis.RTCSessionDescription,
    onError = error => console.error('Multi-line OBS relay:', error)
  } = {}) {
    const required = { db, controller, doc, setDoc, collection, addDoc, onSnapshot, PeerConnection, IceCandidate, SessionDescription };
    for (const [name, value] of Object.entries(required)) {
      if (!value) throw new TypeError(name + ' is required');
    }
    Object.assign(this, { db, controller, doc, setDoc, collection, addDoc, onSnapshot, iceConfig, PeerConnection, IceCandidate, SessionDescription, onError });
    this.bridge = new MultiLineOverlayRelayBridge({ controller, onError });
    this.calls = new Map();
    this.closed = false;
    this.syncInFlight = Promise.resolve();
  }

  watchCall(callId) {
    this.#assertOpen();
    if (typeof callId !== 'string' || !callId.trim()) throw new TypeError('callId is required');
    if (this.calls.has(callId)) return this.calls.get(callId);
    const record = { callId, sessions: new Map(), sessionsUnsub: null, statusUnsub: null, closed: false };
    this.calls.set(callId, record);
    record.sessionsUnsub = this.onSnapshot(
      this.collection(this.db, 'liveCalls', callId, 'overlaySessions'),
      snapshot => {
        for (const change of snapshot.docChanges()) {
          const sessionId = change.doc.id;
          if (change.type === 'removed') {
            this.#closeSession(record, sessionId);
            continue;
          }
          const offer = change.doc.data()?.offer;
          if (offer && !record.sessions.has(sessionId)) this.#startSession(record, sessionId, offer);
        }
      },
      error => this.onError(error)
    );
    record.statusUnsub = this.onSnapshot(
      this.doc(this.db, 'liveCalls', callId),
      snapshot => {
        if (!snapshot.exists?.()) {
          this.unwatchCall(callId).catch(this.onError);
          return;
        }
        const status = String(snapshot.data()?.status || '').toLowerCase();
        if (['ended', 'rejected', 'cancelled', 'canceled', 'completed', 'disconnected'].includes(status)) {
          this.unwatchCall(callId).catch(this.onError);
        }
      },
      error => this.onError(error)
    );
    return record;
  }

  async unwatchCall(callId) {
    const record = this.calls.get(callId);
    if (!record) return;
    this.calls.delete(callId);
    record.closed = true;
    try { record.sessionsUnsub?.(); } catch {}
    try { record.statusUnsub?.(); } catch {}
    for (const sessionId of [...record.sessions.keys()]) this.#closeSession(record, sessionId, false);
    await this.sync();
  }

  async sync() {
    this.#assertOpen();
    const relays = [];
    for (const call of this.calls.values()) {
      for (const session of call.sessions.values()) {
        if (!session.closed) relays.push({ callId: call.callId, sessionId: session.sessionId, pc: session.pc });
      }
    }
    const next = this.syncInFlight.then(() => this.bridge.sync(relays));
    this.syncInFlight = next.catch(error => {
      this.onError(error);
    });
    return next;
  }

  async close() {
    if (this.closed) return;
    const relays = [];
    for (const call of this.calls.values()) {
      for (const session of call.sessions.values()) {
        if (!session.closed) relays.push({ callId: call.callId, sessionId: session.sessionId, pc: session.pc });
      }
    }
    try { await this.bridge.silence(relays); } catch (error) { this.onError(error); }
    for (const callId of [...this.calls.keys()]) {
      const record = this.calls.get(callId);
      this.calls.delete(callId);
      record.closed = true;
      try { record.sessionsUnsub?.(); } catch {}
      try { record.statusUnsub?.(); } catch {}
      for (const sessionId of [...record.sessions.keys()]) this.#closeSession(record, sessionId, false);
    }
    this.closed = true;
    this.bridge.close();
  }

  #startSession(call, sessionId, offer) {
    const sessionRef = this.doc(this.db, 'liveCalls', call.callId, 'overlaySessions', sessionId);
    const pc = new this.PeerConnection(this.iceConfig);
    const record = {
      callId: call.callId, sessionId, sessionRef, pc,
      candidatesUnsub: null, pendingCandidates: [], remoteSet: false, closed: false
    };
    call.sessions.set(sessionId, record);
    pc.onicecandidate = event => {
      if (!event.candidate || record.closed || this.closed) return;
      this.addDoc(this.collection(sessionRef, 'dashboardCandidates'), event.candidate.toJSON())
        .catch(error => this.onError(error));
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) this.#closeSession(call, sessionId);
    };
    record.candidatesUnsub = this.onSnapshot(
      this.collection(sessionRef, 'overlayCandidates'),
      snapshot => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== 'added' || record.closed) continue;
          const candidate = new this.IceCandidate(change.doc.data());
          if (record.remoteSet) {
            pc.addIceCandidate(candidate).catch(error => this.onError(error));
          } else {
            record.pendingCandidates.push(candidate);
          }
        }
      },
      error => this.onError(error)
    );
    this.#negotiate(record, offer).catch(error => {
      this.onError(error);
      this.#closeSession(call, sessionId);
    });
  }

  async #negotiate(record, offer) {
    const { pc } = record;
    await pc.setRemoteDescription(new this.SessionDescription(offer));
    if (record.closed) return;
    record.remoteSet = true;
    for (const candidate of record.pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate);
    }
    const audio = pc.getTransceivers().filter(transceiver => transceiver.receiver?.track?.kind === 'audio');
    if (!audio.length) throw new Error('OBS overlay offer has no audio media lane');
    audio.forEach((transceiver, index) => {
      transceiver.direction = index === 0 ? 'sendonly' : 'inactive';
    });
    pc.getTransceivers()
      .filter(transceiver => transceiver.receiver?.track?.kind === 'video')
      .forEach(transceiver => { transceiver.direction = 'inactive'; });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (record.closed) return;
    await this.setDoc(record.sessionRef, {
      answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      updatedAt: Date.now()
    }, { merge: true });
    await this.sync();
  }

  #closeSession(call, sessionId, sync = true) {
    const record = call.sessions.get(sessionId);
    if (!record) return;
    call.sessions.delete(sessionId);
    record.closed = true;
    try { record.candidatesUnsub?.(); } catch {}
    try { record.pc.close(); } catch {}
    if (sync && !this.closed) this.sync().catch(this.onError);
  }

  #assertOpen() {
    if (this.closed) throw new Error('Multi-line OBS relay adapter is closed');
  }
}
