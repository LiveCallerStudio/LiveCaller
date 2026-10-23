/**
 * Firestore transport adapter for MultiLineMediaController.
 *
 * Inject Firebase modular SDK functions rather than importing a project-specific
 * firebaseConfig. Each call has independent candidate/status subscriptions.
 */
export class FirestoreMultiLineAdapter {
  constructor({
    db,
    controller,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    onSnapshot,
    serverTimestamp = () => new Date()
  } = {}) {
    const required = { db, controller, doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot };
    for (const [name, value] of Object.entries(required)) {
      if (!value) throw new TypeError(`${name} is required`);
    }
    Object.assign(this, required, { serverTimestamp });
    this.calls = new Map();
    this.closed = false;

    // Install the Firestore candidate writer on the controller's injected
    // callback so every peer connection writes into its own call subcollection.
    const previousIceCallback = this.controller.callbacks?.onIceCandidate;
    if (this.controller.callbacks) {
      this.controller.callbacks.onIceCandidate = payload => {
        try { previousIceCallback?.(payload); } catch {}
        this.#publishCandidate(payload);
      };
      const previousHoldCallback = this.controller.callbacks.onHoldState;
      this.controller.callbacks.onHoldState = payload => {
        try { previousHoldCallback?.(payload); } catch {}
        if (payload?.held) {
          const record = this.calls.get(payload.callId);
          if (record) this.updateDoc(record.callRef, {
            status: 'held'
          }).catch(error => console.warn('Could not persist hold state', payload.callId, error?.message || error));
        }
      };
    }
  }

  async answerCall({ callId, callerName, mediaType = 'audio', localStream, lineId } = {}) {
    this.#assertOpen();
    if (this.calls.has(callId)) throw new Error(`Call is already subscribed: ${callId}`);
    const callRef = this.doc(this.db, 'liveCalls', callId);
    const snap = await this.getDoc(callRef);
    const data = snap?.data?.();
    if (!data?.offer) throw new Error('Incoming call has no SDP offer');
    if (['ended', 'rejected', 'cancelled'].includes(String(data.status || '').toLowerCase())) {
      throw new Error('Incoming call is no longer available');
    }

    const record = {
      callId,
      callRef,
      callerName: callerName || data.callerName || 'Caller',
      mediaType: data.mediaType || mediaType,
      lineId: null,
      candidateUnsub: null,
      statusUnsub: null,
      ending: false
    };
    this.calls.set(callId, record);
    try {
      const result = await this.controller.answerCall({
        callId,
        callerName: record.callerName,
        mediaType: record.mediaType,
        offer: data.offer,
        localStream,
        lineId
      });
      record.lineId = result.lineId;
      await this.setDoc(callRef, {
        answer: result.answer,
        status: 'answered'
      }, { merge: true });

      record.candidateUnsub = this.onSnapshot(
        this.collection(this.db, 'liveCalls', callId, 'callerCandidates'),
        snapshot => {
          for (const change of snapshot.docChanges()) {
            if (change.type !== 'added') continue;
            const candidate = change.doc.data();
            this.controller.addRemoteCandidate(callId, candidate).catch(error => {
              console.warn('Could not apply caller ICE candidate', callId, error?.message || error);
            });
          }
        },
        error => console.error('Caller ICE subscription failed', callId, error?.message || error)
      );
      record.statusUnsub = this.onSnapshot(callRef, snapshot => {
        if (!snapshot.exists?.()) return;
        const status = String(snapshot.data()?.status || '').toLowerCase();
        if (['ended', 'rejected', 'cancelled', 'canceled', 'timeout'].includes(status) && !record.ending) {
          this.#disposeRecord(record, { updateFirestore: false });
        }
      }, error => console.error('Call status subscription failed', callId, error?.message || error));
      return { ...result, callerName: record.callerName, mediaType: record.mediaType };
    } catch (error) {
      this.#unsubscribe(record);
      this.calls.delete(callId);
      try { this.controller.endCall(callId); } catch {}
      throw error;
    }
  }

  async takeOnAir(callId) {
    this.#assertOpen();
    const record = this.#requireCall(callId);
    const result = this.controller.takeOnAir(callId);
    try {
      await this.updateDoc(record.callRef, {
        status: 'live'
      });
    } catch (error) {
      // Do not leave audio on-air when its authoritative state could not be
      // persisted. Failing to hold is swallowed only to preserve the original
      // Firestore error; the media controller's hold path is itself fail-closed.
      try { this.controller.holdCall(callId); } catch (holdError) {
        console.error('Could not silence call after on-air persistence failure', callId, holdError?.message || holdError);
      }
      throw error;
    }
    return result;
  }

  async holdCall(callId) {
    this.#assertOpen();
    const record = this.#requireCall(callId);
    // Route audio to silence first. If persistence fails, stay held rather than
    // risking a live program route whose status says something else.
    const result = this.controller.holdCall(callId);
    await this.updateDoc(record.callRef, {
      status: 'held'
    });
    return result;
  }

  async resumeCall(callId) {
    this.#assertOpen();
    const record = this.#requireCall(callId);
    const result = this.controller.resumeCall(callId);
    try {
      await this.updateDoc(record.callRef, { status: 'answered' });
    } catch (error) {
      // If the resume status cannot be persisted, return the caller to the held
      // state and keep the program route silent.
      try { this.controller.holdCall(callId); } catch (holdError) {
        console.error('Could not re-hold call after resume persistence failure', callId, holdError?.message || holdError);
      }
      throw error;
    }
    return result;
  }

  async endCall(callId, status = 'ended') {
    this.#assertOpen();
    // A caller-side hang-up can trigger the status listener and dispose this
    // subscription before the producer's UI action runs. Ending is idempotent:
    // a call already removed by that listener is already locally cleaned up.
    const record = this.calls.get(callId);
    if (!record) return { callId, state: 'ended', alreadyEnded: true };
    record.ending = true;
    try {
      await this.updateDoc(record.callRef, { status });
    } finally {
      this.#disposeRecord(record, { updateFirestore: false });
    }
    return { callId, state: 'ended', alreadyEnded: false };
  }

  getSnapshot() {
    return {
      ...this.controller.getSnapshot(),
      firestoreCalls: [...this.calls.values()].map(record => ({
        callId: record.callId,
        lineId: record.lineId,
        mediaType: record.mediaType,
        subscribed: !!record.statusUnsub && !!record.candidateUnsub
      }))
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const record of this.calls.values()) this.#unsubscribe(record);
    this.calls.clear();
    this.controller.close();
  }

  #publishCandidate({ callId, candidate }) {
    if (!callId || !candidate || this.closed) return;
    const value = typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
    this.addDoc(this.collection(this.db, 'liveCalls', callId, 'dashboardCandidates'), value)
      .catch(error => console.warn('Could not publish producer ICE candidate', callId, error?.message || error));
  }

  #disposeRecord(record, { updateFirestore = false } = {}) {
    if (!this.calls.has(record.callId)) return;
    record.ending = true;
    this.#unsubscribe(record);
    this.calls.delete(record.callId);
    try { this.controller.endCall(record.callId); } catch (error) {
      console.warn('Could not release call media session', record.callId, error?.message || error);
    }
    if (updateFirestore) {
      this.updateDoc(record.callRef, {
        status: 'ended'
      }).catch(error => console.warn('Could not persist call end', record.callId, error?.message || error));
    }
  }

  #unsubscribe(record) {
    try { record.candidateUnsub?.(); } catch {}
    try { record.statusUnsub?.(); } catch {}
    record.candidateUnsub = null;
    record.statusUnsub = null;
  }

  #requireCall(callId) {
    const record = this.calls.get(callId);
    if (!record) throw new Error(`No Firestore subscription for call: ${callId}`);
    return record;
  }

  #assertOpen() {
    if (this.closed) throw new Error('Firestore multi-line adapter is closed');
  }
}
