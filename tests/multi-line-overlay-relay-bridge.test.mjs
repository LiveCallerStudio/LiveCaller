import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiLineOverlayRelayBridge } from '../lib/multi-line-overlay-relay-bridge.js';

function fakePeer(kind = 'audio') {
  const sender = {
    track: null,
    history: [],
    async replaceTrack(track) {
      this.track = track;
      this.history.push(track);
    }
  };
  sender.__audioLane = kind === 'audio';
  return {
    signalingState: 'stable',
    sender,
    getSenders: () => [sender],
    getTransceivers: () => [{
      direction: kind === 'audio' ? 'sendonly' : 'inactive',
      receiver: { track: { kind } },
      sender
    }]
  };
}

function setup() {
  const track = { kind: 'audio', readyState: 'live', id: 'program-bus' };
  const controller = {
    audioRouter: {
      programCallId: null,
      getProgramStream: () => ({ getAudioTracks: () => [track] })
    }
  };
  const errors = [];
  const bridge = new MultiLineOverlayRelayBridge({ controller, onError: error => errors.push(error) });
  return { bridge, controller, track, errors };
}

test('does not send audio to any relay when no caller is selected', async () => {
  const { bridge } = setup();
  const a = fakePeer();
  const b = fakePeer();
  await bridge.sync([{ callId: 'a', pc: a }, { callId: 'b', pc: b }]);
  assert.equal(a.sender.track, null);
  assert.equal(b.sender.track, null);
});

test('only sends program bus audio to the relay matching selected call ID', async () => {
  const { bridge, controller, track } = setup();
  controller.audioRouter.programCallId = 'b';
  const a = fakePeer();
  const b = fakePeer();
  await bridge.sync([{ callId: 'a', pc: a }, { callId: 'b', pc: b }]);
  assert.equal(a.sender.track, null);
  assert.equal(b.sender.track, track);
});

test('switching callers clears the previous relay before enabling the next', async () => {
  const { bridge, controller, track } = setup();
  const a = fakePeer();
  const b = fakePeer();
  const relays = [{ callId: 'a', pc: a }, { callId: 'b', pc: b }];
  controller.audioRouter.programCallId = 'a';
  await bridge.sync(relays);
  assert.equal(a.sender.track, track);
  controller.audioRouter.programCallId = 'b';
  await bridge.sync(relays);
  assert.equal(a.sender.track, null);
  assert.equal(b.sender.track, track);
  assert.equal(a.sender.history.at(-1), null);
});

test('does not route audio through a lane configured inactive even if its current direction is stale', async () => {
  const { bridge, controller, track } = setup();
  controller.audioRouter.programCallId = 'selected';
  const peer = fakePeer();
  const transceiver = {
    direction: 'inactive',
    currentDirection: 'sendonly',
    receiver: { track: { kind: 'audio' } },
    sender: peer.sender
  };
  peer.getTransceivers = () => [transceiver];
  await bridge.sync([{ callId: 'selected', pc: peer }]);
  assert.equal(peer.sender.track, null);
  assert.notEqual(peer.sender.track, track);
});

test('a selected route failure silences every relay and reports the error', async () => {
  const { bridge, controller, errors } = setup();
  controller.audioRouter.programCallId = 'b';
  const a = fakePeer();
  const b = fakePeer();
  b.sender.replaceTrack = async track => {
    if (track) throw new Error('replace failed');
    b.sender.track = null;
  };
  await assert.rejects(
    bridge.sync([{ callId: 'a', pc: a }, { callId: 'b', pc: b }]),
    /replace failed/
  );
  assert.equal(a.sender.track, null);
  assert.equal(b.sender.track, null);
  assert.equal(errors.length, 1);
});

test('a throwing error reporter cannot replace routing failure or interrupt silence', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { bridge, controller } = setup();
    bridge.onError = () => { throw new Error('reporter crashed'); };
    controller.audioRouter.programCallId = 'selected';
    const other = fakePeer();
    const selected = fakePeer();
    selected.sender.replaceTrack = async track => {
      if (track) throw new Error('program route failed');
      selected.sender.track = null;
    };
    await assert.rejects(
      bridge.sync([{ callId: 'other', pc: other }, { callId: 'selected', pc: selected }]),
      /program route failed/
    );
    assert.equal(other.sender.track, null);
    assert.equal(selected.sender.track, null);
  } finally {
    console.error = originalError;
  }
});

test('silence clears all audio lanes and close prevents further use', async () => {
  const { bridge, controller, track } = setup();
  controller.audioRouter.programCallId = 'a';
  const a = fakePeer();
  await bridge.sync([{ callId: 'a', pc: a }]);
  assert.equal(a.sender.track, track);
  await bridge.silence([{ callId: 'a', pc: a }]);
  assert.equal(a.sender.track, null);
  bridge.close();
  await assert.rejects(bridge.sync([]), /closed/);
});
