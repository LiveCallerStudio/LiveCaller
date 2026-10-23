import assert from 'node:assert/strict';
import { CALL_STATE, MultiLineCallManager } from '../lib/multi-line-call-manager.js';

const events = [];
const manager = new MultiLineCallManager({
  routeToProgram: id => events.push(['route', id]),
  setHoldAudio: (id, enabled) => events.push(['hold', id, enabled]),
  closeCall: id => events.push(['close', id])
});
const a = manager.registerCall({ callId: 'a', callerName: 'Caller A' });
const b = manager.registerCall({ callId: 'b', callerName: 'Caller B' });
const c = manager.registerCall({ callId: 'c', callerName: 'Caller C' });

assert.deepEqual([a.lineId, b.lineId, c.lineId], [1, 2, 3]);
assert.throws(() => manager.registerCall({ callId: 'd' }), /occupied|available|Line/);
assert.throws(() => manager.registerCall({ callId: 'a' }), /already registered/);
assert.equal(manager.getSnapshot().programCallId, null);
assert.deepEqual(manager.getCall(1).state, CALL_STATE.WAITING);

manager.setScreening(2);
assert.equal(manager.getCall(2).state, CALL_STATE.SCREENING);
assert.throws(() => manager.takeOnAir(2), /connected/);
manager.markConnected(1);
manager.markConnected(2);
manager.markConnected(3);
manager.takeOnAir(1);
assert.equal(manager.getSnapshot().programCallId, 'a');
assert.equal(manager.getCall(1).state, CALL_STATE.ON_AIR);

events.length = 0;
manager.takeOnAir(2);
assert.deepEqual(events, [
  ['route', null],
  ['hold', 'a', true],
  ['hold', 'b', false],
  ['route', 'b']
], 'switching callers must disconnect program first, hold the old caller, then route the new caller');
assert.equal(manager.getCall(1).state, CALL_STATE.HELD);
assert.equal(manager.getCall(2).state, CALL_STATE.ON_AIR);
assert.equal(manager.getSnapshot().programCallId, 'b');

events.length = 0;
manager.hold(2);
assert.deepEqual(events, [['route', null], ['hold', 'b', true]]);
assert.equal(manager.getSnapshot().programCallId, null);
assert.equal(manager.getCall(2).state, CALL_STATE.HELD);

manager.takeOnAir(3);
assert.equal(manager.getCall(3).state, CALL_STATE.ON_AIR);
assert.equal(manager.getCall(2).state, CALL_STATE.HELD);
assert.equal(manager.getSnapshot().programCallId, 'c');

events.length = 0;
manager.endCall(3);
assert.deepEqual(events, [['route', null], ['hold', 'c', false], ['close', 'c']]);
assert.equal(manager.getSnapshot().programCallId, null);
assert.equal(manager.getCall(3), null);
assert.equal(manager.getCall(1).state, CALL_STATE.HELD);
assert.equal(manager.getCall(2).state, CALL_STATE.HELD);

assert.throws(() => manager.markConnected(3), /no live call/);
assert.throws(() => manager.hold(99), /lineId/);
console.log('three-line call manager: all tests passed');
