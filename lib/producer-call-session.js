/**
 * Owns one producer-side WebRTC call session.
 *
 * This class is intentionally independent of Firestore and the dashboard DOM.
 * Each call gets its own instance, peer connection, remote stream, senders and
 * ICE candidate queue. The caller must route remote audio to monitoring/program
 * output explicitly; this class never connects audio to an output by itself.
 */
export class ProducerCallSession {
  constructor({
    callId,
    peerConnectionFactory = (config) => new RTCPeerConnection(config),
    iceConfig,
    onTrack = () => {},
    onIceCandidate = () => {},
    onConnectionState = () => {},
    onIceConnectionState = () => {},
    onIceCandidateError = () => {}
  } = {}) {
    if (typeof callId !== 'string' || !callId.trim()) {
      throw new TypeError('callId is required');
    }
    this.callId = callId;
    this.pc = peerConnectionFactory(iceConfig);
    this.remoteStream = new MediaStream();
    this.senders = new Map();
    this.pendingCandidates = [];
    this.closed = false;
    this.remoteDescriptionReady = false;
    this.callbacks = { onTrack, onIceCandidate, onConnectionState, onIceConnectionState, onIceCandidateError };

    this.pc.ontrack = (event) => {
      if (this.closed) return;
      const track = event.track;
      if (track && !this.remoteStream.getTracks().some(existing => existing.id === track.id)) {
        this.remoteStream.addTrack(track);
      }
      this.callbacks.onTrack({ session: this, event, stream: this.remoteStream });
    };
    this.pc.onicecandidate = (event) => {
      if (!this.closed && event.candidate) {
        this.callbacks.onIceCandidate({ callId: this.callId, candidate: event.candidate });
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (!this.closed) this.callbacks.onConnectionState({ callId: this.callId, state: this.pc.connectionState });
    };
    this.pc.oniceconnectionstatechange = () => {
      if (!this.closed) this.callbacks.onIceConnectionState({ callId: this.callId, state: this.pc.iceConnectionState });
    };
    this.pc.onicecandidateerror = (event) => {
      if (!this.closed) this.callbacks.onIceCandidateError({ callId: this.callId, event });
    };
  }

  addLocalStream(stream) {
    this.#assertOpen();
    if (!stream || typeof stream.getTracks !== 'function') throw new TypeError('A MediaStream is required');
    for (const track of stream.getTracks()) {
      const sender = this.pc.addTrack(track, stream);
      this.senders.set(track.kind, sender);
    }
    return new Map(this.senders);
  }

  async acceptOffer(offer) {
    this.#assertOpen();
    if (!offer || offer.type !== 'offer' || !offer.sdp) throw new TypeError('A valid SDP offer is required');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionReady = true;
    const queued = this.pendingCandidates.splice(0);
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate).catch(error => {
        console.warn('Discarding queued ICE candidate for call', this.callId, error?.message || error);
      });
    }
  }

  async addRemoteCandidate(candidate) {
    this.#assertOpen();
    if (!candidate) return;
    const normalized = candidate instanceof RTCIceCandidate ? candidate : new RTCIceCandidate(candidate);
    if (!this.remoteDescriptionReady) {
      this.pendingCandidates.push(normalized);
      return;
    }
    await this.pc.addIceCandidate(normalized);
  }

  async createAnswer(transformSdp = (sdp) => sdp) {
    this.#assertOpen();
    if (!this.remoteDescriptionReady) throw new Error('Accept the remote offer before creating an answer');
    const raw = await this.pc.createAnswer();
    const sdp = transformSdp(raw.sdp);
    const answer = { type: raw.type, sdp };
    await this.pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }

  async replaceTrack(kind, track) {
    this.#assertOpen();
    const sender = this.senders.get(kind);
    if (!sender) throw new Error(`No ${kind} sender exists for call ${this.callId}`);
    await sender.replaceTrack(track || null);
  }

  close({ stopLocalTracks = false, stopRemoteTracks = false } = {}) {
    if (this.closed) return;
    this.closed = true;
    this.pendingCandidates.length = 0;
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onicecandidateerror = null;
    try { this.pc.close(); } catch {}
    if (stopLocalTracks) {
      for (const sender of this.senders.values()) {
        try { sender.track?.stop(); } catch {}
      }
    }
    if (stopRemoteTracks) {
      for (const track of this.remoteStream.getTracks()) {
        try { track.stop(); } catch {}
      }
    }
    for (const track of this.remoteStream.getTracks()) {
      try { this.remoteStream.removeTrack(track); } catch {}
    }
    this.senders.clear();
  }

  #assertOpen() {
    if (this.closed) throw new Error(`Call session ${this.callId} is closed`);
  }
}
