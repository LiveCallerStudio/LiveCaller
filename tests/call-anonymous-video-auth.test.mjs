import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../call.html', import.meta.url), 'utf8');
const script = [...source.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0]?.[1] ?? '';

test('caller page uses Firebase anonymous auth for video without requiring manual login', () => {
  assert.match(script, /import \{ getAuth, signInAnonymously \} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.13\.0\/firebase-auth\.js"/);
  assert.match(script, /async function getOrCreateGuestUser\(\)/);
  assert.match(script, /await auth\.authStateReady\(\)/);
  assert.match(script, /guestAuthPromise = signInAnonymously\(auth\)/);
});

test('video call authenticates before media capture and stores the matching guest UID', () => {
  const authPosition = script.indexOf("if(callMode === 'video'){");
  const mediaPosition = script.indexOf('navigator.mediaDevices.getUserMedia({', authPosition);
  const payloadPosition = script.indexOf("callDocRef = await addDoc(collection(db, 'liveCalls')");
  assert.ok(authPosition >= 0, 'video-only auth branch exists');
  assert.ok(mediaPosition > authPosition, 'auth branch precedes media capture');
  assert.ok(payloadPosition > mediaPosition, 'call document is created after auth and media capture');
  assert.match(script.slice(payloadPosition, payloadPosition + 700), /\.\.\.\(callMode === 'video' \? \{ guestUid \} : \{\}\)/);
});

test('audio calls do not require anonymous auth or include a guest UID', () => {
  assert.match(script, /\}else\{\s*guestUid = null;\s*\}/);
  assert.match(script, /\.\.\.\(callMode === 'video' \? \{ guestUid \} : \{\}\)/);
});
