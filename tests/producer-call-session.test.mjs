import assert from 'node:assert/strict';

class FakeTrack {
  constructor(kind, id) { this.kind = kind; this.id = id; this.stopped = false; }
  stop() { this.stopped = true; }
}
class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  addTrack(track) { if (!this.tracks.some(item => item.id === track.id)) this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(item => item.id !== track.id); }
}
class FakeCandidate {
  constructor(value) { Object.assign(this, value); }
}
class FakeDescription {
  constructor(value) { Object.assign(this, value); }
}
class FakeSender {
  constructor(track) { this.track = track; this.replacements = []; }
  async replaceTrack(track) { this.track = track; this.replacements.push(track); }
}
class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.addedTracks = [];
    this.addedCandidates = [];
    this.closed = false;
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.remoteDescription = null;
    this.localDescription = null;
  }
  addTrack(track, stream) {
    const sender = new FakeSender(track);
    this.addedTracks.push({ track, stream, sender });
    return sender;
  }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  async createAnswer() { return { type: 'answer', sdp: 'original-sdp' }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async addIceCandidate(candidate) { this.addedCandidates.push(candidate); }
  close() { this.closed = true; this.connectionState = 'closed'; }
}
globalThis.MediaStream = FakeStream;
globalThis.RTCIceCandidate = FakeCandidate;
globalThis.RTCSessionDescription = FakeDescription;

const { ProducerCallSession } = await import('../lib/producer-call-session.js');
const peers = [];
const makePeer = config => {
  const peer = new FakePeerConnection(config);
  peers.push(peer);
  return peer;
};
const seenCandidates = [];
const first = new ProducerCallSession({
  callId: 'call-a',
  iceConfig: { iceServers: [] },
  peerConnectionFactory: makePeer,
  onIceCandidate: event => seenCandidates.push(event)
});
const second = new ProducerCallSession({
  callId: 'call-b',
  iceConfig: { iceServers: [] },
  peerConnectionFactory: makePeer
});
assert.notEqual(first.pc, second.pc, 'each call must own an independent peer connection');
assert.notEqual(first.remoteStream, second.remoteStream, 'each call must own an independent remote stream');

const micA = new FakeTrack('audio', 'mic-a');
const micB = new FakeTrack('audio', 'mic-b');
first.addLocalStream(new FakeStream([micA]));
second.addLocalStream(new FakeStream([micB]));
assert.equal(first.senders.get('audio').track.id, 'mic-a');
assert.equal(second.senders.get('audio').track.id, 'mic-b');

await first.addRemoteCandidate({ candidate: 'candidate-before-offer' });
assert.equal(first.pc.addedCandidates.length, 0, 'remote ICE candidates wait until remote description is ready');
await first.acceptOffer({ type: 'offer', sdp: 'offer-a' });
assert.equal(first.pc.addedCandidates.length, 1, 'queued ICE candidate is applied after the offer');
await first.addRemoteCandidate({ candidate: 'candidate-after-offer' });
assert.equal(first.pc.addedCandidates.length, 2);
const answer = await first.createAnswer(sdp => sdp.replace('original', 'tuned'));
assert.deepEqual(answer, { type: 'answer', sdp: 'tuned-sdp' });
assert.equal(first.pc.localDescription.sdp, 'tuned-sdp');

const remoteA = new FakeTrack('audio', 'remote-a');
first.pc.ontrack({ track: remoteA, streams: [new FakeStream([remoteA])] });
assert.equal(first.remoteStream.getTracks()[0].id, 'remote-a');
assert.equal(second.remoteStream.getTracks().length, 0, 'a caller track must never enter another line stream');

first.pc.onicecandidate({ candidate: { candidate: 'local-candidate-a' } });
assert.deepEqual(seenCandidates, [{ callId: 'call-a', candidate: { candidate: 'local-candidate-a' } }]);

await first.replaceTrack('audio', null);
assert.equal(first.senders.get('audio').track, null);
assert.equal(second.senders.get('audio').track.id, 'mic-b', 'holding one line must not mute another line');

first.close();
assert.equal(first.pc.closed, true);
assert.equal(first.pc.ontrack, null, 'closed session must detach event handlers');
assert.equal(second.pc.closed, false, 'closing one line must not close another line');
assert.throws(() => first.addLocalStream(new FakeStream()), /closed/);
second.close({ stopLocalTracks: true });
assert.equal(micB.stopped, true);
console.log('producer call session: all tests passed');
