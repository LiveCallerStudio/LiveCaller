/**
 * DOM view for the three-line call controller.
 *
 * This is a UI adapter, not the production dashboard integration by itself.
 * The host supplies incoming calls and a producer audio-stream factory. No
 * caller is routed to program output by this view; that requires an explicit
 * Take On Air action through the Firestore adapter.
 */
export class MultiLineDashboardView {
  constructor({
    root,
    adapter,
    controller,
    getLocalStream,
    onError = error => console.error(error)
  } = {}) {
    if (!root || typeof root.replaceChildren !== 'function') {
      throw new TypeError('A root DOM element is required');
    }
    if (!adapter || !controller) throw new TypeError('adapter and controller are required');
    if (typeof getLocalStream !== 'function') throw new TypeError('getLocalStream is required');
    this.root = root;
    this.adapter = adapter;
    this.controller = controller;
    this.getLocalStream = getLocalStream;
    this.onError = onError;
    this.incomingCalls = [];
    this.busy = new Set();
    this.closed = false;
    this.clickHandler = event => this.#handleClick(event);
    this.root.addEventListener('click', this.clickHandler);
    this.render();
  }

  setIncomingCalls(calls = []) {
    this.#assertOpen();
    this.incomingCalls = calls.filter(call => call?.id && call?.offer && call.status === 'waiting');
    this.render();
  }

  render() {
    if (this.closed) return;
    const snapshot = this.adapter.getSnapshot();
    const lineById = new Map((snapshot.lines || []).map(line => [line.lineId, line]));
    const occupied = new Set((snapshot.lines || []).filter(line => line.callId).map(line => line.callId));
    const sections = [1, 2, 3].map(lineId => {
      const line = lineById.get(lineId) || { lineId, callId: null, state: 'empty' };
      const caller = line.callId
        ? this.adapter.getSnapshot().firestoreCalls?.find(call => call.callId === line.callId)
        : null;
      const incoming = this.incomingCalls.filter(call => !occupied.has(call.id));
      const state = line.state || (line.callId ? 'connected' : 'empty');
      const title = line.callerName || (line.callId ? line.callId : 'Line available');
      const actions = line.callId
        ? `<button type="button" data-ml-action="monitor" data-call-id="${this.#escape(line.callId)}">Monitor</button>
           <button type="button" data-ml-action="hold" data-call-id="${this.#escape(line.callId)}">Hold / Mute Program</button>
           <button type="button" data-ml-action="air" data-call-id="${this.#escape(line.callId)}">Take On Air</button>
           <button type="button" data-ml-action="end" data-call-id="${this.#escape(line.callId)}">End Call</button>`
        : incoming.map(call => `<button type="button" data-ml-action="answer" data-call-id="${this.#escape(call.id)}" data-line-id="${lineId}" ${this.busy.has(call.id) ? 'disabled' : ''}>Answer ${this.#escape(call.callerName || 'Caller')} on Line ${lineId}</button>`).join('');
      return `<article class="ml-dashboard-line" data-line-id="${lineId}" style="border:1px solid var(--border,rgba(255,255,255,.15));border-radius:12px;padding:12px;margin:8px 0;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
          <strong>LINE ${String(lineId).padStart(2, '0')} · ${this.#escape(state.toUpperCase())}</strong>
          <span>${this.#escape(title)}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${actions || '<span>No call assigned</span>'}</div>
      </article>`;
    });
    this.root.innerHTML = sections.join('');
  }

  async #handleClick(event) {
    const button = event.target.closest?.('[data-ml-action]');
    if (!button || !this.root.contains(button) || button.disabled) return;
    const action = button.dataset.mlAction;
    const callId = button.dataset.callId;
    if (!callId) return;
    button.disabled = true;
    try {
      if (action === 'answer') {
        this.busy.add(callId);
        const call = this.incomingCalls.find(item => item.id === callId);
        if (!call) throw new Error('Incoming call is no longer in the queue');
        const localStream = await this.getLocalStream(call);
        await this.adapter.answerCall({
          callId,
          callerName: call.callerName || 'Caller',
          mediaType: call.mediaType || 'audio',
          localStream,
          lineId: Number(button.dataset.lineId)
        });
      } else if (action === 'monitor') {
        this.controller.setMonitor(callId);
      } else if (action === 'hold') {
        await this.adapter.holdCall(callId);
      } else if (action === 'air') {
        await this.adapter.takeOnAir(callId);
      } else if (action === 'end') {
        await this.adapter.endCall(callId);
      }
      this.render();
    } catch (error) {
      this.onError(error);
    } finally {
      this.busy.delete(callId);
      if (!this.closed) this.render();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.root.removeEventListener('click', this.clickHandler);
    this.root.replaceChildren();
    this.incomingCalls = [];
    this.busy.clear();
  }

  #escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  #assertOpen() {
    if (this.closed) throw new Error('Multi-line dashboard view is closed');
  }
}
