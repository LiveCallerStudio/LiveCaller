import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../call.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0]?.[1] ?? '';

test('caller audio context is unlocked from the initial user gesture', () => {
  assert.match(script, /function unlockCallerAudioContext\(\)/);
  assert.match(script, /callerAudioContext\.resume\(\)/);
  assert.match(script, /unlockCallerAudioContext\(\)\.catch\(\(\)=>\{\}\)/);
});

test('hold music reuses and resumes the unlocked context instead of creating a fresh suspended context', () => {
  assert.match(script, /async function startHoldMusicCaller\(\)/);
  assert.match(script, /holdMusicCtx = callerAudioContext/);
  assert.match(script, /if\(holdMusicCtx\.state !== 'running'\) await holdMusicCtx\.resume\(\)/);
  assert.doesNotMatch(script, /function startHoldMusicCaller\(\)\s*\{\s*stopHoldMusicCaller\(\);\s*holdMusicCtx = new \(window\.AudioContext/);
});

test('stopping hold music keeps the shared context alive; call cleanup closes it', () => {
  const stop = script.slice(script.indexOf('function stopHoldMusicCaller'), script.indexOf('const setupScreen'));
  assert.match(stop, /holdMusicCtx = null/);
  assert.doesNotMatch(stop, /holdMusicCtx\.close\(\)/);
  const cleanup = script.slice(script.indexOf('function cleanup(updateFirestore'), script.indexOf('cameraBtn.addEventListener'));
  assert.match(cleanup, /callerAudioContext\.close\(\)/);
  assert.match(cleanup, /callerAudioContext = null/);
});
