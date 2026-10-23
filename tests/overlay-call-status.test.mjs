import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveOverlayCallStatus } from '../lib/overlay-call-status.js';

test('keeps overlay signaling alive for legacy and multi-line active statuses', () => {
  for (const status of ['live', 'answered', 'on-air', 'on-hold', 'LIVE', ' Answered ']) {
    assert.equal(isActiveOverlayCallStatus(status), true, status);
  }
});

test('stops overlay signaling for missing and terminal call statuses', () => {
  for (const status of ['', null, undefined, 'ended', 'rejected', 'cancelled', 'canceled', 'completed', 'disconnected', 'ringing']) {
    assert.equal(isActiveOverlayCallStatus(status), false, String(status));
  }
});
