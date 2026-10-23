import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiLineOverlayRelayAdapter } from '../lib/multi-line-overlay-relay-adapter.js';

function fakeSnapshot(changes = [], data = {}, exists = true) {
  return { docChanges: () => changes, data: () => data, exists: () => exists };
}
function setup({ addDocError = null, rejectPeerCreation = false, rejectRemoteDescription = false, rejectRemoteCandidate = false, rejectIceCandidateConstruction = false, rejectCandidateSubscription = false, rejectCallWatcherSetup = false, setDocError = null, onError = error => { throw error; } } = {}) {
  const listeners = new Map();
  const errorListeners = new Map();
  const writes = [];
  const candidates = [];
  const audioTrack = { kind: 'audio', readyState: 'live', id: 'program' };
  const controller = { audioRouter: { programCallId: null, getProgramStream: () => ({ getAudioTracks: () => [audioTrack] }) } };
  class Peer {
    constructor() {
      if (rejectPeerCreation) throw new Error('peer creation failed');
      this.signalingState = 'stable'; this.connectionState = 'new'; this.transceivers = [
        { receiver: { track: { kind: 'audio' } }, sender: { track: null, async replaceTrack(track) { this.track = track; } } },
        { receiver: { track: { kind: 'video' } }, sender: { track: null, async replaceTrack(track) { this.track = track; } } }
      ];
      this.closed = false;
    }
    getTransceivers() { return this.transceivers; }
    getSenders() { return this.transceivers.map(t => t.sender); }
    async setRemoteDescription(value) {
      if (rejectRemoteDescription) throw new Error('invalid remote offer');
      this.remoteDescription = value;
    }
    async addIceCandidate(value) {
      if (rejectRemoteCandidate) throw new Error('remote ICE candidate rejected');
      (this.remoteCandidates ||= []).push(value);
    }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\\r\\nanswer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    close() { this.closed = true; this.connectionState = 'closed'; }
  }
  const adapter = new MultiLineOverlayRelayAdapter({
    db: {}, controller, iceConfig: [], RTCPeerConnection: Peer,
    RTCIceCandidate: class { constructor(value) {
      if (rejectIceCandidateConstruction) throw new Error('malformed ICE candidate');
      Object.assign(this, value);
    } },
    RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
    doc: (_db, ...parts) => parts.join('/'),
    collection: (dbOrRef, ...parts) => typeof dbOrRef === 'string' ? [dbOrRef, ...parts].join('/') : parts.join('/'),
    setDoc: async (...args) => { if (setDocError) throw setDocError; writes.push(args); },
    addDoc: async (...args) => { if (addDocError) throw addDocError; candidates.push(args); },
    onSnapshot: (path, next, error) => {
      if (rejectCallWatcherSetup && path === 'liveCalls/call-watch-setup-error/overlaySessions') throw new Error('call watcher setup failed');
      if (rejectCandidateSubscription && path.endsWith('/overlayCandidates')) throw new Error('candidate listener setup failed');
      listeners.set(path, next);
      if (error) errorListeners.set(path, error);
      return () => { listeners.delete(path); errorListeners.delete(path); };
    },
    onError
  });
  return { adapter, listeners, errorListeners, writes, candidates, controller, audioTrack };
}

test('watches a call, answers overlay offers, and silences relay while no call is selected', async () => {
  const { adapter, listeners, writes } = setup();
  adapter.watchCall('call-a');
  const path = 'liveCalls/call-a/overlaySessions';
  listeners.get(path)(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-1', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].answer.type, 'answer');
  const relay = adapter.calls.get('call-a').sessions.get('overlay-1');
  assert.equal(relay.pc.transceivers[0].direction, 'sendonly');
  assert.equal(relay.pc.transceivers[1].direction, 'inactive');
  assert.equal(relay.pc.transceivers[0].sender.track, null);
  await adapter.close();
  assert.equal(relay.pc.closed, true);
});


test('peer connection construction failure is reported without escaping the Firestore callback', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectPeerCreation: true,
    onError: error => reportedErrors.push(error)
  });
  adapter.watchCall('call-peer-creation-error');
  assert.doesNotThrow(() => listeners.get('liveCalls/call-peer-creation-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-peer-creation-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }])));
  assert.equal(adapter.calls.get('call-peer-creation-error').sessions.has('overlay-peer-creation-error'), false);
  assert.equal(reportedErrors.some(error => /peer creation failed/.test(error.message)), true);
  await adapter.close();
});

test('invalid overlay offers close the peer and remove the failed session', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectRemoteDescription: true,
    onError: error => reportedErrors.push(error)
  });
  adapter.watchCall('call-invalid-offer');
  listeners.get('liveCalls/call-invalid-offer/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-invalid-offer', data: () => ({ offer: { type: 'offer', sdp: 'malformed' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const call = adapter.calls.get('call-invalid-offer');
  assert.equal(call.sessions.has('overlay-invalid-offer'), false);
  assert.equal(reportedErrors.some(error => /invalid remote offer/.test(error.message)), true);
  await adapter.close();
});

test('selected program audio is routed only to the matching call overlay', async () => {
  const { adapter, listeners, controller, audioTrack } = setup();
  adapter.watchCall('call-a');
  adapter.watchCall('call-b');
  for (const callId of ['call-a', 'call-b']) {
    listeners.get(`liveCalls/${callId}/overlaySessions`)(fakeSnapshot([{
      type: 'added', doc: { id: 'overlay', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
    }]));
  }
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  controller.audioRouter.programCallId = 'call-b';
  await adapter.sync();
  assert.equal(adapter.calls.get('call-a').sessions.get('overlay').pc.transceivers[0].sender.track, null);
  assert.equal(adapter.calls.get('call-b').sessions.get('overlay').pc.transceivers[0].sender.track, audioTrack);
  await adapter.close();
});

test('ending a call closes its relay and unsubscribes its listeners', async () => {
  const { adapter, listeners } = setup();
  adapter.watchCall('call-a');
  listeners.get('liveCalls/call-a/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-a').sessions.get('overlay');
  listeners.get('liveCalls/call-a')?.(fakeSnapshot([], { status: 'ended' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.calls.has('call-a'), false);
  assert.equal(relay.pc.closed, true);
});

test('unknown and inactive parent statuses close overlay relays fail-closed', async () => {
  for (const status of ['waiting', 'ringing', '', null, 'unexpected-status']) {
    const { adapter, listeners } = setup();
    const callId = 'call-inactive-' + String(status || 'blank').replace(/[^a-z0-9-]/gi, '-');
    adapter.watchCall(callId);
    listeners.get(`liveCalls/${callId}/overlaySessions`)(fakeSnapshot([{
      type: 'added', doc: { id: 'overlay', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
    }]));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const relay = adapter.calls.get(callId).sessions.get('overlay');
    listeners.get(`liveCalls/${callId}`)?.(fakeSnapshot([], { status }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adapter.calls.has(callId), false, String(status));
    assert.equal(relay.pc.closed, true, String(status));
    await adapter.close();
  }
});

test('terminal call status with surrounding whitespace closes the overlay relay', async () => {
  const { adapter, listeners } = setup();
  adapter.watchCall('call-status-whitespace');
  listeners.get('liveCalls/call-status-whitespace/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-status-whitespace', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-status-whitespace').sessions.get('overlay-status-whitespace');
  listeners.get('liveCalls/call-status-whitespace')?.(fakeSnapshot([], { status: ' ended ' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.calls.has('call-status-whitespace'), false);
  assert.equal(relay.pc.closed, true);
});

test('parent call deletion closes all relays and removes subscriptions', async () => {
  const { adapter, listeners } = setup();
  adapter.watchCall('call-deleted');
  listeners.get('liveCalls/call-deleted/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-deleted').sessions.get('overlay');
  listeners.get('liveCalls/call-deleted')(fakeSnapshot([], {}, false));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.calls.has('call-deleted'), false);
  assert.equal(relay.pc.closed, true);
  assert.equal(listeners.has('liveCalls/call-deleted/overlaySessions'), false);
  await adapter.close();
});



test('call status subscription errors close all call relays and unsubscribe watchers', async () => {
  const { adapter, listeners, errorListeners } = setup();
  adapter.watchCall('call-status-error');
  listeners.get('liveCalls/call-status-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-status-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-status-error').sessions.get('overlay-status-error');
  errorListeners.get('liveCalls/call-status-error')(new Error('status permission denied'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.calls.has('call-status-error'), false);
  assert.equal(relay.pc.closed, true);
  assert.equal(listeners.has('liveCalls/call-status-error/overlaySessions'), false);
  await adapter.close();
});

test('overlay session subscription errors close all call relays and unsubscribe watchers', async () => {
  const { adapter, listeners, errorListeners } = setup();
  adapter.watchCall('call-session-error');
  listeners.get('liveCalls/call-session-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-session-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-session-error').sessions.get('overlay-session-error');
  errorListeners.get('liveCalls/call-session-error/overlaySessions')(new Error('session permission denied'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.calls.has('call-session-error'), false);
  assert.equal(relay.pc.closed, true);
  assert.equal(listeners.has('liveCalls/call-session-error'), false);
  await adapter.close();
});

test('candidate signaling errors close the affected relay and remove its listener', async () => {
  const { adapter, listeners, errorListeners } = setup();
  adapter.watchCall('call-error');
  listeners.get('liveCalls/call-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-error').sessions.get('overlay-error');
  const candidatePath = 'liveCalls/call-error/overlaySessions/overlay-error/overlayCandidates';
  assert.equal(typeof errorListeners.get(candidatePath), 'function');
  errorListeners.get(candidatePath)(new Error('permission denied'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(relay.pc.closed, true);
  assert.equal(adapter.calls.get('call-error').sessions.has('overlay-error'), false);
  assert.equal(listeners.has(candidatePath), false);
  await adapter.close();
});


test('local ICE publication failure closes the relay instead of leaving it active', async () => {
  const { adapter, listeners } = setup({
    addDocError: new Error('candidate write denied'),
    onError: () => {}
  });
  adapter.watchCall('call-local-ice-error');
  listeners.get('liveCalls/call-local-ice-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-local-ice-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-local-ice-error').sessions.get('overlay-local-ice-error');
  relay.pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'candidate-write-fails' }) } });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(relay.pc.closed, true);
  assert.equal(adapter.calls.get('call-local-ice-error').sessions.has('overlay-local-ice-error'), false);
  await adapter.close();
});





test('answer publication failure closes the peer before reporting the error', async () => {
  const reportedErrors = [];
  let adapterRef;
  let closedBeforeReport = false;
  const { adapter, listeners } = setup({
    setDocError: new Error('answer write denied'),
    onError: error => {
      reportedErrors.push(error);
      closedBeforeReport = !adapterRef?.calls.get('call-answer-write-error')?.sessions.has('overlay-answer-write-error');
    }
  });
  adapterRef = adapter;
  adapter.watchCall('call-answer-write-error');
  listeners.get('liveCalls/call-answer-write-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-answer-write-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const call = adapter.calls.get('call-answer-write-error');
  assert.equal(call.sessions.has('overlay-answer-write-error'), false);
  assert.equal(reportedErrors.some(error => /answer write denied/.test(error.message)), true);
  assert.equal(closedBeforeReport, true);
  await adapter.close();
});


test('a throwing error reporter cannot interrupt answer failure cleanup', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { adapter, listeners } = setup({
      setDocError: new Error('answer write denied'),
      onError: () => { throw new Error('reporter crashed'); }
    });
    adapter.watchCall('call-throwing-reporter');
    listeners.get('liveCalls/call-throwing-reporter/overlaySessions')(fakeSnapshot([{
      type: 'added', doc: { id: 'overlay-throwing-reporter', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
    }]));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adapter.calls.get('call-throwing-reporter').sessions.has('overlay-throwing-reporter'), false);
    await adapter.close();
  } finally {
    console.error = originalError;
  }
});


test('synchronous call watcher setup failure rolls back the partial call record', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectCallWatcherSetup: true,
    onError: error => reportedErrors.push(error)
  });
  assert.throws(() => adapter.watchCall('call-watch-setup-error'), /call watcher setup failed/);
  assert.equal(adapter.calls.has('call-watch-setup-error'), false);
  assert.equal(listeners.has('liveCalls/call-watch-setup-error/overlaySessions'), false);
  assert.equal(reportedErrors.some(error => /call watcher setup failed/.test(error.message)), true);
  await adapter.close();
});

test('late Firestore offer snapshot cannot recreate a session after unwatch', async () => {
  const { adapter, listeners } = setup();
  adapter.watchCall('call-late-offer');
  const path = 'liveCalls/call-late-offer/overlaySessions';
  const lateSnapshot = listeners.get(path);
  await adapter.unwatchCall('call-late-offer');
  lateSnapshot(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-late', data: () => ({ offer: { type: 'offer', sdp: 'late-offer' } }) }
  }]));
  assert.equal(adapter.calls.has('call-late-offer'), false);
  await adapter.close();
});

test('late Firestore offer snapshot cannot create a session while adapter is closing', async () => {
  const { adapter, listeners } = setup();
  adapter.watchCall('call-closing-late-offer');
  const path = 'liveCalls/call-closing-late-offer/overlaySessions';
  const lateSnapshot = listeners.get(path);
  const closing = adapter.close();
  lateSnapshot(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-closing-late', data: () => ({ offer: { type: 'offer', sdp: 'late-offer' } }) }
  }]));
  await closing;
  assert.equal(adapter.calls.size, 0);
  assert.equal(adapter.closed, true);
});

test('candidate listener setup failure closes the peer and removes the session', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectCandidateSubscription: true,
    onError: error => reportedErrors.push(error)
  });
  adapter.watchCall('call-listener-setup-error');
  listeners.get('liveCalls/call-listener-setup-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-listener-setup-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  const call = adapter.calls.get('call-listener-setup-error');
  assert.equal(call.sessions.has('overlay-listener-setup-error'), false);
  assert.equal(reportedErrors.some(error => /candidate listener setup failed/.test(error.message)), true);
  await adapter.close();
});

test('malformed remote ICE candidate data closes the relay and removes its listener', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectIceCandidateConstruction: true,
    onError: error => reportedErrors.push(error)
  });
  adapter.watchCall('call-malformed-ice');
  listeners.get('liveCalls/call-malformed-ice/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-malformed-ice', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const call = adapter.calls.get('call-malformed-ice');
  const relay = call.sessions.get('overlay-malformed-ice');
  listeners.get('liveCalls/call-malformed-ice/overlaySessions/overlay-malformed-ice/overlayCandidates')(fakeSnapshot([{
    type: 'added', doc: { id: 'candidate-malformed', data: () => ({ candidate: 'invalid' }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(relay.pc.closed, true);
  assert.equal(call.sessions.has('overlay-malformed-ice'), false);
  assert.equal(listeners.has('liveCalls/call-malformed-ice/overlaySessions/overlay-malformed-ice/overlayCandidates'), false);
  assert.equal(reportedErrors.some(error => /malformed ICE candidate/.test(error.message)), true);
  await adapter.close();
});

test('rejected early remote ICE candidates close the relay and remove the session', async () => {
  const reportedErrors = [];
  const { adapter, listeners } = setup({
    rejectRemoteCandidate: true,
    onError: error => reportedErrors.push(error)
  });
  adapter.watchCall('call-remote-ice-error');
  listeners.get('liveCalls/call-remote-ice-error/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-remote-ice-error', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  listeners.get('liveCalls/call-remote-ice-error/overlaySessions/overlay-remote-ice-error/overlayCandidates')(fakeSnapshot([{
    type: 'added', doc: { id: 'candidate-rejected', data: () => ({ candidate: 'invalid-candidate' }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const call = adapter.calls.get('call-remote-ice-error');
  assert.equal(call.sessions.has('overlay-remote-ice-error'), false);
  assert.equal(reportedErrors.some(error => /remote ICE candidate rejected/.test(error.message)), true);
  await adapter.close();
});

test('queues early ICE candidates until the remote offer is applied and publishes local candidates', async () => {
  const { adapter, listeners, candidates } = setup();
  adapter.watchCall('call-ice');
  listeners.get('liveCalls/call-ice/overlaySessions')(fakeSnapshot([{
    type: 'added', doc: { id: 'overlay-ice', data: () => ({ offer: { type: 'offer', sdp: 'offer' } }) }
  }]));
  const candidateListener = listeners.get('liveCalls/call-ice/overlaySessions/overlay-ice/overlayCandidates');
  candidateListener(fakeSnapshot([{
    type: 'added', doc: { id: 'candidate-early', data: () => ({ candidate: 'early-candidate' }) }
  }]));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const relay = adapter.calls.get('call-ice').sessions.get('overlay-ice');
  assert.deepEqual(relay.pc.remoteCandidates.map(candidate => candidate.candidate), ['early-candidate']);
  relay.pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'local-candidate' }) } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0][0], 'liveCalls/call-ice/overlaySessions/overlay-ice/dashboardCandidates');
  assert.deepEqual(candidates[0][1], { candidate: 'local-candidate' });
  await adapter.close();
});
