import assert from 'node:assert/strict';

class FakeTrack {
  constructor(kind, id) { this.kind = kind; this.id = id; this.readyState = 'live'; }
}
class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
}
class FakeNode {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
class FakeGain extends FakeNode {
  constructor() { super(); this.gain = { value: 1 }; }
}
class FakeAudioContext {
  constructor() {
    this.destination = new FakeNode();
    this.sources = [];
    this.gains = [];
  }
  createMediaStreamDestination() { return { stream: new FakeStream(), node: new FakeNode() }; }
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createMediaStreamSource(stream) { const node = new FakeNode(); node.stream = stream; this.sources.push(node); return node; }
}
globalThis.MediaStream = FakeStream;

const { ProgramAudioRouter } = await import('../lib/program-audio-router.js');
const context = new FakeAudioContext();
const programDestination = context.createMediaStreamDestination();
const router = new ProgramAudioRouter({ audioContext: context, programDestination });
router.registerCall('caller-a');
router.registerCall('caller-b');
router.registerCall('caller-c');
const trackA = new FakeTrack('audio', 'track-a');
const trackB = new FakeTrack('audio', 'track-b');
const trackC = new FakeTrack('audio', 'track-c');
router.attachTrack('caller-a', trackA);
router.attachTrack('caller-b', trackB);
router.attachTrack('caller-c', trackC);

router.setProgramCall('caller-a');
assert.equal(router.getCall('caller-a').programGain, 1);
assert.equal(router.getCall('caller-b').programGain, 0);
assert.equal(router.getCall('caller-c').programGain, 0);

router.setMonitorCall('caller-b');
assert.equal(router.getCall('caller-a').monitorGain, 0, 'monitor can listen to a different caller than program');
assert.equal(router.getCall('caller-b').monitorGain, 1);
assert.equal(router.getCall('caller-c').monitorGain, 0);

router.setProgramCall('caller-c');
assert.equal(router.programCallId, 'caller-c');
assert.equal(router.getCall('caller-a').programGain, 0, 'previous caller must be muted before switching');
assert.equal(router.getCall('caller-b').programGain, 0);
assert.equal(router.getCall('caller-c').programGain, 1);
assert.equal(router.getCall('caller-b').monitorGain, 1, 'switching program must not change monitor selection');

assert.throws(() => router.setProgramCall('missing-caller'), /not registered/);
assert.equal(router.programCallId, null, 'invalid selection fails closed');
assert.deepEqual([...router.calls.values()].map(call => call.programGain.gain.value), [0, 0]);

router.setProgramCall('caller-a');
router.removeCall('caller-a');
assert.equal(router.programCallId, null, 'removing the program caller silences program output');
assert.equal(router.getCall('caller-a'), null);

assert.throws(() => router.attachTrack('caller-b', new FakeTrack('video', 'video-b')), /audio track/);

// An ended track must never leave the previous caller routed to program.
router.setProgramCall('caller-b');
trackB.readyState = 'ended';
assert.throws(() => router.setProgramCall('caller-b'), /no live incoming audio track/);
assert.equal(router.programCallId, null, 'ended program track fails closed');
assert.deepEqual([...router.calls.values()].map(call => call.programGain.gain.value), [0, 0, 0]);
assert.throws(() => router.setMonitorCall('caller-b'), /no live incoming audio track/);
assert.equal(router.monitorCallId, null, 'ended monitor track is rejected');
assert.deepEqual([...router.calls.values()].map(call => call.monitorGain.gain.value), [0, 0]);
router.close();
assert.equal(router.closed, true);
assert.equal(router.calls.size, 0);
assert.throws(() => router.setProgramCall(null), /closed/);
console.log('program audio router: all tests passed');
