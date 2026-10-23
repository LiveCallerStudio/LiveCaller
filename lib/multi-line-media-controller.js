import { MultiLineCallManager } from './multi-line-call-manager.js';
import { ProducerCallSession } from './producer-call-session.js';
import { ProgramAudioRouter } from './program-audio-router.js';

/**
 * Media/session coordinator for a three-line producer dashboard.
 *
 * Firestore remains an injected transport adapter. This class owns independent
 * peer connections and audio routes, and never treats a waiting caller as live
 * program audio. UI/Firestore code must explicitly call takeOnAir().
 */
export class MultiLineMediaController {
  constructor({
    iceConfig,
    audioRouter = new ProgramAudioRouter(),
    peerConnectionFactory,
    onHoldState = () => {},
    onCallClosed = () => {},
    onTrack = () => {},
    onIceCandidate = () => {},
    onConnectionState = () => {}
  } = {}) {
    this.iceConfig = iceConfig;
    this.audioRouter = audioRouter;
    this.peerConnectionFactory = peerConnectionFactory;
    this.callbacks = { onHoldState, onCallClosed, onTrack, onIceCandidate, onConnectionState };
    this.sessions = new Map();
    this.lineManager = new MultiLineCallManager({
      routeToProgram: callId => this.audioRouter.setProgramCall(callId),
      setHoldAudio: (callId, held) => this.callbacks.onHoldState({ callId, held }),
      closeCall: callId => this.#disposeSession(callId)
    });
    this.closed = false;
  }

  async answerCall({
    callId,
    callerName = 'Caller',
    mediaType = 'audio',
    offer,
    localStream,
    lineId
  } = {}) {
    this.#assertOpen();
    if (this.sessions.has(callId)) throw new Error(`Call already has a media session: ${callId}`);
    if (!localStream || typeof localStream.getTracks !== 'function') {
      throw new TypeError('A local producer MediaStream is required');
    }

    const line = this.lineManager.registerCall({ callId, callerName, mediaType, lineId });
    try {
      this.audioRouter.registerCall(callId);
      const session = new ProducerCallSession({
        callId,
        iceConfig: this.iceConfig,
        peerConnectionFactory: this.peerConnectionFactory,
        onTrack: ({ session: sourceSession, event, stream }) => {
          if (this.closed || this.sessions.get(callId)?.session !== sourceSession) return;
          if (event.track?.kind === 'audio') this.audioRouter.attachTrack(callId, event.track);
          this.callbacks.onTrack({ callId, lineId: line.lineId, event, stream });
        },
        onIceCandidate: candidate => this.callbacks.onIceCandidate(candidate),
        onConnectionState: state => this.callbacks.onConnectionState(state)
      });
      this.sessions.set(callId, { callId, lineId: line.lineId, session, mediaType, localStream });
      session.addLocalStream(localStream);
      await session.acceptOffer(offer);
      const answer = await session.createAnswer();
      this.lineManager.markConnected(line.lineId);
      return { ...line, state: 'connected', answer };
    } catch (error) {
      this.#disposeSession(callId);
      const current = this.lineManager.getCall(line.lineId);
      if (current) {
        // endCall invokes the same per-call disposal callback; it does not touch
        // any other session or route except this call if it owned program output.
        this.lineManager.endCall(line.lineId);
      }
      throw error;
    }
  }

  async addRemoteCandidate(callId, candidate) {
    this.#assertOpen();
    const entry = this.#requireSession(callId);
    return entry.session.addRemoteCandidate(candidate);
  }

  takeOnAir(callId) {
    this.#assertOpen();
    const entry = this.#requireSession(callId);
    const line = this.lineManager.getCall(entry.lineId);
    if (!line) throw new Error('Call no longer owns a line');
    return this.lineManager.takeOnAir(entry.lineId);
  }

  setMonitor(callId = null) {
    this.#assertOpen();
    return this.audioRouter.setMonitorCall(callId);
  }

  holdCall(callId) {
    this.#assertOpen();
    const entry = this.#requireSession(callId);
    return this.lineManager.hold(entry.lineId);
  }

  async replaceLocalTrack(callId, kind, track) {
    this.#assertOpen();
    const entry = this.#requireSession(callId);
    return entry.session.replaceTrack(kind, track);
  }

  endCall(callId) {
    this.#assertOpen();
    const entry = this.#requireSession(callId);
    return this.lineManager.endCall(entry.lineId);
  }

  getSnapshot() {
    return {
      ...this.lineManager.getSnapshot(),
      sessions: [...this.sessions.values()].map(({ callId, lineId, mediaType, session }) => ({
        callId, lineId, mediaType, closed: session.closed,
        connectionState: session.pc.connectionState,
        hasRemoteAudio: session.remoteStream.getAudioTracks().some(track => track.readyState !== 'ended')
      }))
    };
  }

  close() {
    if (this.closed) return;
    // Clear program output before releasing any session, then close each peer.
    this.audioRouter.setProgramCall(null);
    for (const callId of [...this.sessions.keys()]) this.#disposeSession(callId);
    this.audioRouter.close();
    this.closed = true;
  }

  #disposeSession(callId) {
    const entry = this.sessions.get(callId);
    if (!entry) {
      this.audioRouter.removeCall(callId);
      return;
    }
    this.sessions.delete(callId);
    // Each dashboard answer currently acquires a dedicated producer stream.
    // Stop its microphone tracks when this call ends to avoid leaving the mic live.
    try { entry.session.close({ stopLocalTracks: true, stopRemoteTracks: false }); } catch {}
    try { this.audioRouter.removeCall(callId); } catch {}
    this.callbacks.onCallClosed({ callId, lineId: entry.lineId });
  }

  #requireSession(callId) {
    const entry = this.sessions.get(callId);
    if (!entry) throw new Error(`No live media session for call: ${callId}`);
    return entry;
  }

  #assertOpen() {
    if (this.closed) throw new Error('Multi-line media controller is closed');
  }
}
