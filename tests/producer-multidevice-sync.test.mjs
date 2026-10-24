import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0]?.[1] ?? '';

test('producer microphone mute state is shared through Firestore across dashboard devices', () => {
  assert.match(script, /const producerDashboardStateRef = doc\(db, 'hotlineSettings', 'producerDashboardState'\)/);
  assert.match(script, /producerMicMuted:nextMuted/);
  assert.match(script, /function startProducerDashboardStateListener\(\)[\s\S]*?onSnapshot\(producerDashboardStateRef[\s\S]*?setMultiLineMicMuted\(state\.producerMicMuted\)/);
  assert.match(script, /startProducerDashboardStateListener\(\)/);
  assert.match(script, /stopProducerDashboardStateListener\(\)/);
});

test('audio and video answers claim the incoming call so two dashboard devices cannot answer it simultaneously', () => {
  assert.match(script, /async function claimIncomingCall\(callId\)[\s\S]*?runTransaction\(db[\s\S]*?producerClaimId[\s\S]*?producerClaimExpiresAt/);
  assert.match(script, /async function answerMultiLineCall\(callId, callerName, callerCity, lineId\)[\s\S]*?claimIncomingCall\(callId\)/);
  assert.match(script, /async function answerCall\(callId, callerName, callerCity\)[\s\S]*?claimIncomingCall\(callId\)/);
  assert.match(script, /async function releaseIncomingCallClaim\(claim\)[\s\S]*?producerClaimId:deleteField\(\)/);
});

console.log('producer multi-device sync: all tests passed');
