/**
 * Bridges the experimental multi-line program bus to OBS overlay relay peers.
 *
 * The bridge is deliberately transport-agnostic: the host supplies relay
 * records with their source call ID and RTCPeerConnection. It forwards audio
 * only, and only to the relay whose call ID is the currently selected program
 * call. It never forwards a producer microphone or a caller's raw track.
 *
 * This module is not wired into the legacy dashboard relay yet. Keep the UI's
 * Take On Air control disabled until the host owns peer lifecycle, candidate
 * signaling, disconnect cleanup, and fail-closed integration end-to-end.
 */
export class MultiLineOverlayRelayBridge {
  constructor({ controller, onError = error => console.error(error) } = {}) {
    if (!controller?.audioRouter || typeof controller.audioRouter.getProgramStream !== 'function') {
      throw new TypeError('A multi-line controller with a program audio router is required');
    }
    this.controller = controller;
    this.onError = onError;
    this.closed = false;
    this.syncVersion = 0;
  }

  async sync(relayRecords = []) {
    this.#assertOpen();
    const version = ++this.syncVersion;
    const selectedCallId = this.controller.audioRouter.programCallId;
    const programStream = selectedCallId ? this.controller.audioRouter.getProgramStream() : null;
    const programTrack = programStream?.getAudioTracks?.().find(track => track.readyState === 'live') || null;
    const records = relayRecords.filter(record => record?.pc && typeof record.callId === 'string');

    // First silence every non-selected relay. Do this before opening the selected
    // route so switching never briefly sends the previous caller to OBS.
    await Promise.all(records.map(async record => {
      if (record.callId === selectedCallId && programTrack) return;
      await this.#replaceAudio(record.pc, null);
    }));

    if (version !== this.syncVersion || this.closed) return;
    if (!selectedCallId || !programTrack) return;

    const selected = records.filter(record => record.callId === selectedCallId);
    try {
      await Promise.all(selected.map(record => this.#replaceAudio(record.pc, programTrack)));
    } catch (error) {
      // Any failure during a take silences every relay in this pass.
      await Promise.all(records.map(record => this.#replaceAudio(record.pc, null).catch(() => {})));
      this.onError(error);
      throw error;
    }
  }

  async silence(relayRecords = []) {
    this.#assertOpen();
    ++this.syncVersion;
    const records = relayRecords.filter(record => record?.pc);
    const results = await Promise.allSettled(records.map(record => this.#replaceAudio(record.pc, null)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) {
      this.onError(failed.reason);
      throw failed.reason;
    }
  }

  close() {
    if (this.closed) return;
    ++this.syncVersion;
    this.closed = true;
  }

  async #replaceAudio(pc, track) {
    if (!pc || pc.signalingState === 'closed') return;
    const audioSenders = (pc.getSenders?.() || []).filter(sender =>
      sender.track?.kind === 'audio' || sender.kind === 'audio' || sender.__audioLane === true
    );
    // Some browsers report sender.track === null after replaceTrack(null), so
    // hosts should mark known audio lanes with __audioLane or keep a stable
    // sender reference. We also accept a sender matched by its transceiver.
    const transceiverSenders = (pc.getTransceivers?.() || [])
      .filter(transceiver => transceiver.receiver?.track?.kind === 'audio')
      .map(transceiver => transceiver.sender)
      .filter(Boolean);
    const senders = [...new Set([...audioSenders, ...transceiverSenders])];
    await Promise.all(senders.map(sender => sender.replaceTrack(track)));
  }

  #assertOpen() {
    if (this.closed) throw new Error('Multi-line OBS relay bridge is closed');
  }
}
