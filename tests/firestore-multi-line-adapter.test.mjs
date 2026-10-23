import assert from 'node:assert/strict';
import { FirestoreMultiLineAdapter } from '../lib/firestore-multi-line-adapter.js';

const docs = new Map();
const listeners = new Map();
const writes = [];
let failNextUpdate = false;
const pathOf = parts => parts.join('/');
const db = {};
const doc = (_db, ...parts) => ({ path: pathOf(parts) });
const collection = (_db, ...parts) => ({ path: pathOf(parts) });
const getDoc = async ref => ({
  exists: () => docs.has(ref.path),
  data: () => docs.get(ref.path) ? { ...docs.get(ref.path) } : undefined
});
const setDoc = async (ref, data, options = {}) => {
  docs.set(ref.path, options.merge ? { ...(docs.get(ref.path) || {}), ...data } : { ...data });
  writes.push({ type: 'set', path: ref.path, data });
};
const updateDoc = async (ref, data) => {
  if (failNextUpdate) {
    failNextUpdate = false;
    throw new Error('simulated Firestore write failure');
  }
  docs.set(ref.path, { ...(docs.get(ref.path) || {}), ...data });
  writes.push({ type: 'update', path: ref.path, data });
};
const addDoc = async (ref, data) => {
  writes.push({ type: 'add', path: ref.path, data });
  return { id: 'candidate-' + writes.length };
};
const onSnapshot = (ref, next, error) => {
  const list = listeners.get(ref.path) || [];
  const record = { next, error, active: true };
  list.push(record);
  listeners.set(ref.path, list);
  return () => { record.active = false; };
};
const serverTimestamp = () => 'server-time';
const emit = (path, snapshot) => {
  for (const listener of listeners.get(path) || []) if (listener.active) listener.next(snapshot);
};

const fakeController = {
  callbacks: {
    onIceCandidate: () => {},
    onHoldState: () => {}
  },
  answered: [],
  candidates: [],
  ended: [],
  held: [],
  resumed: [],
  closed: false,
  async answerCall(args) {
    this.answered.push(args);
    return { callId: args.callId, lineId: this.answered.length, state: 'connected', answer: { type: 'answer', sdp: 'v=0\\r\\n' } };
  },
  async addRemoteCandidate(callId, candidate) { this.candidates.push({ callId, candidate }); },
  takeOnAir(callId) { return { callId, state: 'on-air' }; },
  holdCall(callId) { this.held.push(callId); return { callId, state: 'held' }; },
  resumeCall(callId) { this.resumed.push(callId); return { callId, state: 'connected' }; },
  endCall(callId) { this.ended.push(callId); },
  getSnapshot() { return { lines: [] }; },
  close() { this.closed = true; }
};

for (const id of ['a', 'b', 'c']) {
  docs.set('liveCalls/' + id, { offer: { type: 'offer', sdp: 'offer-sdp' }, status: 'waiting', mediaType: 'audio' });
}
const adapter = new FirestoreMultiLineAdapter({
  db, controller: fakeController, doc, getDoc, setDoc, updateDoc,
  collection, addDoc, onSnapshot, serverTimestamp
});
const localStream = { getTracks: () => [{ kind: 'audio', id: 'producer-track' }] };
const [a, b, c] = await Promise.all([
  adapter.answerCall({ callId: 'a', localStream }),
  adapter.answerCall({ callId: 'b', localStream }),
  adapter.answerCall({ callId: 'c', localStream })
]);
assert.deepEqual([a.lineId, b.lineId, c.lineId], [1, 2, 3]);
assert.equal(docs.get('liveCalls/a').status, 'answered');
assert.equal('producerLineId' in docs.get('liveCalls/c'), false, 'adapter must not write fields rejected by the rules schema');
assert.equal(adapter.getSnapshot().firestoreCalls.length, 3);

fakeController.callbacks.onIceCandidate({
  callId: 'b',
  candidate: { toJSON: () => ({ candidate: 'candidate-b' }) }
});
await Promise.resolve();
assert.ok(writes.some(w => w.path === 'liveCalls/b/dashboardCandidates' && w.data.candidate === 'candidate-b'));

const candidatePath = 'liveCalls/a/callerCandidates';
emit(candidatePath, {
  docChanges: () => [{ type: 'added', doc: { data: () => ({ candidate: 'incoming-a' }) } }]
});
await Promise.resolve();
assert.deepEqual(fakeController.candidates, [{ callId: 'a', candidate: { candidate: 'incoming-a' } }]);

await adapter.takeOnAir('a');
assert.equal(docs.get('liveCalls/a').status, 'live');
await adapter.holdCall('b');
assert.equal(docs.get('liveCalls/b').status, 'held');
await adapter.resumeCall('b');
assert.equal(docs.get('liveCalls/b').status, 'answered');
assert.deepEqual(fakeController.resumed, ['b']);
await adapter.holdCall('b');
failNextUpdate = true;
await assert.rejects(adapter.resumeCall('b'), /simulated Firestore write failure/);
assert.ok(fakeController.held.includes('b'), 'failed resume persistence must return the caller to hold');
assert.equal(docs.get('liveCalls/b').status, 'held');

failNextUpdate = true;
await assert.rejects(adapter.takeOnAir('c'), /simulated Firestore write failure/);
assert.ok(fakeController.held.includes('c'), 'failed on-air persistence must force the selected caller back to hold');
assert.notEqual(docs.get('liveCalls/c').status, 'live', 'Firestore must not falsely claim the call went on-air');

emit('liveCalls/b', { exists: () => true, data: () => ({ status: 'ended' }) });
assert.ok(fakeController.ended.includes('b'));
assert.equal(adapter.calls.has('b'), false);
assert.equal(adapter.calls.has('a'), true, 'ending one call must not remove other subscriptions');
const endedCountBeforeDuplicate = fakeController.ended.length;
const duplicateEnd = await adapter.endCall('b');
assert.equal(duplicateEnd.alreadyEnded, true, 'producer hang-up must be safe after caller already ended');
assert.equal(fakeController.ended.length, endedCountBeforeDuplicate, 'duplicate end must not close a call twice');

await adapter.endCall('a');
assert.equal(docs.get('liveCalls/a').status, 'ended');
assert.equal(adapter.calls.has('a'), false);
assert.equal(adapter.calls.has('c'), true);

// Keep every direct liveCalls document write within the allowlist and status
// enum from the supplied validAudioCall Firestore rules. Candidate subcollections
// have their own schema and are intentionally excluded from this assertion.
const allowedCallFields = new Set([
  'callerName', 'callerCity', 'offer', 'answer', 'status', 'createdAt',
  'updatedAt', 'liveSince', 'rejectedAt', 'mediaType', 'guestUid',
  'screeningSessionId'
]);
const allowedCallStatuses = new Set([
  'waiting', 'answered', 'held', 'live', 'ended', 'timeout', 'rejected'
]);
for (const write of writes.filter(item => item.path.split('/').length === 2 && item.path.startsWith('liveCalls/'))) {
  for (const field of Object.keys(write.data)) {
    assert.ok(allowedCallFields.has(field), `unexpected liveCalls field: ${field}`);
  }
  if ('status' in write.data) {
    assert.ok(allowedCallStatuses.has(write.data.status), `unexpected liveCalls status: ${write.data.status}`);
  }
}

adapter.close();
assert.equal(fakeController.closed, true);
assert.equal(adapter.calls.size, 0);
await assert.rejects(adapter.answerCall({ callId: 'c', localStream }), /closed/);
console.log('Firestore multi-line adapter: all tests passed');
