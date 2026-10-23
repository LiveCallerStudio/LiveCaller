import assert from 'node:assert/strict';

class FakeTrack {
  constructor(kind, id) { this.kind = kind; this.id = id; this.readyState = 'live'; this.stopped = false; }
  stop() { this.stopped = true; this.readyState = 'ended'; }
}
class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; this.id = 'stream-' + Math.random(); }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  addTrack(track) { if (!this.tracks.some(t => t.id === track.id)) this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(t => t !== track); }
}
class FakeGain {
  constructor() { this.gain = { value: 1 }; this.connections = []; }
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; }
}
class FakeAudioContext {
  constructor() { this.destination = {}; }
  createGain() { return new FakeGain(); }
  createMediaStreamSource(stream) { return { stream, connect() {}, disconnect() {} }; }
}
class FakePeer {
  constructor() {
    this.senders = [];
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.remoteDescription = null;
    this.localDescription = null;
    this.closed = false;
  }
  addTrack(track, stream) {
    const sender = { track, stream, replaceTrack: async next => { sender.track = next; } };
    this.senders.push(sender);
    return sender;
  }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  async addIceCandidate(candidate) { (this.candidates ||= []).push(candidate); }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\\r\\n' }; }
  async setLocalDescription(description) { this.localDescription = description; }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
globalThis.MediaStream = FakeStream;
globalThis.RTCSessionDescription = class { constructor(value) { Object.assign(this, value); } };
globalThis.RTCIceCandidate = class { constructor(value) { Object.assign(this, value); } };

const { MultiLineMediaController } = await import('../lib/multi-line-media-controller.js');
const context = new FakeAudioContext();
const programDestination = { stream: new FakeStream() };
const audioRouter = new (await import('../lib/program-audio-router.js')).ProgramAudioRouter({
  audioContext: context,
  programDestination,
  monitorDestination: context.destination
});
const peers = [];
const holdEvents = [];
const closedEvents = [];
const controller = new MultiLineMediaController({
  iceConfig: {},
  audioRouter,
  peerConnectionFactory: () => { const peer = new FakePeer(); peers.push(peer); return peer; },
  onHoldState: event => holdEvents.push(event),
  onCallClosed: event => closedEvents.push(event)
});
const offer = { type: 'offer', sdp: 'v=0\\r\\n' };
const localA = new FakeStream([new FakeTrack('audio', 'producer-a')]);
const localB = new FakeStream([new FakeTrack('audio', 'producer-b')]);
const localC = new FakeStream([new FakeTrack('audio', 'producer-c')]);

const a = await controller.answerCall({ callId: 'call-a', callerName: 'A', offer, localStream: localA });
const b = await controller.answerCall({ callId: 'call-b', callerName: 'B', offer, localStream: localB });
const c = await controller.answerCall({ callId: 'call-c', callerName: 'C', offer, localStream: localC });
assert.deepEqual([a.lineId, b.lineId, c.lineId], [1, 2, 3]);
assert.equal(peers.length, 3, 'each line gets its own peer connection');

const remoteA = new FakeTrack('audio', 'remote-a');
peers[0].ontrack({ track: remoteA, streams: [new FakeStream([remoteA])] });
const remoteB = new FakeTrack('audio', 'remote-b');
peers[1].ontrack({ track: remoteB, streams: [new FakeStream([remoteB])] });
const remoteC = new FakeTrack('audio', 'remote-c');
peers[2].ontrack({ track: remoteC, streams: [new FakeStream([remoteC])] });

controller.takeOnAir('call-a');
assert.equal(audioRouter.programCallId, 'call-a');
controller.setMonitor('call-b');
assert.equal(audioRouter.monitorCallId, 'call-b');

controller.takeOnAir('call-c');
assert.equal(audioRouter.programCallId, 'call-c');
assert.equal(audioRouter.getCall('call-a').programGain, 0);
assert.equal(audioRouter.getCall('call-c').programGain, 1);
assert.equal(audioRouter.getCall('call-b').monitorGain, 1);
assert.ok(holdEvents.some(event => event.callId === 'call-a' && event.held), 'previous on-air call gets hold-state callback');

controller.resumeCall('call-a');
assert.equal(controller.lineManager.getCall(1).state, 'connected');
assert.equal(audioRouter.programCallId, 'call-c', 'resuming a held call must not steal the current program route');
controller.holdCall('call-a');
assert.equal(controller.lineManager.getCall(1).state, 'held');

const before = controller.getSnapshot();
assert.equal(before.lines.filter(line => line.callId).length, 3);
controller.endCall('call-b');
assert.equal(controller.getSnapshot().sessions.length, 2, 'ending one line leaves the other two sessions alive');
assert.equal(peers[1].closed, true);
assert.equal(peers[0].closed, false);
assert.equal(peers[2].closed, false);
assert.equal(audioRouter.getCall('call-b'), null);
assert.ok(closedEvents.some(event => event.callId === 'call-b'));

controller.endCall('call-c');
assert.equal(audioRouter.programCallId, null, 'ending the on-air caller clears program routing');
assert.equal(peers[2].closed, true);
controller.close();
assert.equal(controller.closed, true);
assert.equal(peers[0].closed, true);
assert.equal(audioRouter.closed, true);
console.log('multi-line media controller: all tests passed');
