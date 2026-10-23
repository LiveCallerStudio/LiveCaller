/**
 * Bridges the experimental multi-line program bus to OBS overlay relay peers.
 *
 * The host supplies relay records with their source call ID and peer connection.
 * Only the relay matching the selected program call receives the program-bus
 * track. This module never forwards a producer microphone or a caller's raw
 * track. It is not yet wired into the legacy dashboard.
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

    try {
      // Clear all other relays before enabling the selected one. Any clear
      // failure is treated as a failed switch, not a reason to keep going.
      await Promise.all(records.map(async record => {
        if (record.callId === selectedCallId && programTrack) return;
        await this.#replaceAudio(record.pc, null);
      }));

      if (version !== this.syncVersion || this.closed) {
        await Promise.all(records.map(record => this.#replaceAudio(record.pc, null).catch(() => {})));
        return;
      }
      if (!selectedCallId || !programTrack) return;

      const selected = records.filter(record => record.callId === selectedCallId);
      await Promise.all(selected.map(record => this.#replaceAudio(record.pc, programTrack)));

      // A newer selection may have happened while replaceTrack was pending.
      // Re-silence stale work so an older async take cannot win the race.
      if (version !== this.syncVersion || this.closed ||
          this.controller.audioRouter.programCallId !== selectedCallId) {
        await Promise.all(records.map(record => this.#replaceAudio(record.pc, null).catch(() => {})));
      }
    } catch (error) {
      // Any failure during clearing or enabling triggers best-effort silence of
      // every supplied relay before surfacing the error.
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
    // Only negotiated send-only audio lanes may carry program audio. Inactive
    // audio m-lines must stay silent even if a sender retained an old track.
    const transceiverSenders = (pc.getTransceivers?.() || [])
      .filter(transceiver =>
        transceiver.receiver?.track?.kind === 'audio' &&
        (transceiver.direction === 'sendonly' || transceiver.currentDirection === 'sendonly')
      )
      .map(transceiver => transceiver.sender)
      .filter(Boolean);
    const senders = [...new Set(transceiverSenders)];
    await Promise.all(senders.map(sender => sender.replaceTrack(track)));
  }

  #assertOpen() {
    if (this.closed) throw new Error('Multi-line OBS relay bridge is closed');
  }
}
