import assert from 'node:assert/strict';
import { MultiLineDashboardView } from '../lib/multi-line-dashboard-view.js';

class FakeRoot {
  constructor() { this.listeners = new Map(); this.innerHTML = ''; this.childrenCleared = false; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  replaceChildren() { this.innerHTML = ''; this.childrenCleared = true; }
  contains(node) { return !!node && node.inside !== false; }
  click(button) {
    const handler = this.listeners.get('click');
    return handler({ target: { closest: selector => selector === '[data-ml-action]' ? button : null } });
  }
}
const root = new FakeRoot();
const calls = [];
const snapshot = {
  lines: [
    { lineId: 1, callId: 'a', callerName: 'Caller A', state: 'connected' },
    { lineId: 2, callId: null, state: 'empty' },
    { lineId: 3, callId: null, state: 'empty' }
  ],
  firestoreCalls: [{ callId: 'a', lineId: 1 }]
};
const controller = {
  setMonitor: id => calls.push(['monitor', id])
};
const adapter = {
  getSnapshot: () => snapshot,
  answerCall: async args => calls.push(['answer', args]),
  holdCall: async id => calls.push(['hold', id]),
  takeOnAir: async id => calls.push(['air', id]),
  endCall: async id => calls.push(['end', id])
};
const errors = [];
const view = new MultiLineDashboardView({
  root, adapter, controller,
  getLocalStream: async call => ({ tracks: [], forCall: call.id }),
  onError: error => errors.push(error)
});
view.setIncomingCalls([{ id: 'waiting-x', callerName: '<Guest>', status: 'waiting', offer: { type: 'offer', sdp: 'sdp' } }]);
assert.match(root.innerHTML, /LINE 01/);
assert.match(root.innerHTML, /&lt;Guest&gt;/);
assert.match(root.innerHTML, /data-ml-action="answer"/);
assert.match(root.innerHTML, /Take On Air/);

await root.click({ inside: true, disabled: false, dataset: { mlAction: 'monitor', callId: 'a' } });
assert.deepEqual(calls[0], ['monitor', 'a']);
await root.click({ inside: true, disabled: false, dataset: { mlAction: 'answer', callId: 'waiting-x', lineId: '2' } });
assert.equal(calls[1][0], 'answer');
assert.equal(calls[1][1].lineId, 2);
assert.equal(calls[1][1].localStream.forCall, 'waiting-x');
assert.deepEqual(errors, []);
view.close();
assert.equal(root.listeners.has('click'), false);
assert.equal(root.innerHTML, '');
console.log('multi-line dashboard view: all tests passed');
