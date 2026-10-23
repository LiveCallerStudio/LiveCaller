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
            status: 'on-hold',
            producerLineId: record.lineId,
            heldAt: this.serverTimestamp()
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
        status: 'answered',
        producerLineId: result.lineId,
        answeredAt: this.serverTimestamp()
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
        if (['ended', 'rejected', 'cancelled', 'canceled'].includes(status) && !record.ending) {
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
    await this.updateDoc(record.callRef, {
      status: 'on-air',
      producerLineId: record.lineId,
      onAirAt: this.serverTimestamp()
    });
    return result;
  }

  async holdCall(callId) {
    this.#assertOpen();
    const record = this.#requireCall(callId);
    const result = this.controller.holdCall(callId);
    await this.updateDoc(record.callRef, {
      status: 'on-hold',
      producerLineId: record.lineId,
      heldAt: this.serverTimestamp()
    });
    return result;
  }

  async endCall(callId, status = 'ended') {
    this.#assertOpen();
    const record = this.#requireCall(callId);
    record.ending = true;
    try {
      await this.updateDoc(record.callRef, { status, endedAt: this.serverTimestamp() });
    } finally {
      this.#disposeRecord(record, { updateFirestore: false });
    }
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
        status: 'ended',
        endedAt: this.serverTimestamp()
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
