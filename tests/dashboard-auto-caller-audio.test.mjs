import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0]?.[1] ?? '';

test('multi-line dashboard has no manual Monitor Caller control or event action', () => {
  assert.doesNotMatch(script, /Monitor Caller|Stop Monitor|multi-monitor|selectMultiLineDashboardAudio/);
  assert.doesNotMatch(script, /data-action="multi-monitor"/);
});

test('a newly connected caller automatically becomes the dashboard audio source', () => {
  const setup = script.slice(script.indexOf('function ensureMultiLineController'), script.indexOf('function closeMultiLineController'));
  assert.match(setup, /onTrack:\s*\(\{callId,stream\}\)\s*=>\s*\{[\s\S]*?routeMultiLineDashboardAudio\(callId,stream\)/);
  assert.doesNotMatch(setup, /if\(!multiLineDashboardAudioCallId\)\s*routeMultiLineDashboardAudio/);
});

test('held or ended callers automatically fall back to another connected line', () => {
  assert.match(script, /if\(held && multiLineDashboardAudioCallId===callId\)\s*\{\s*routeMultiLineDashboardAudio\(findAvailableMultiLineAudioCall\(callId\)\)/);
  assert.match(script, /if\(multiLineDashboardAudioCallId===callId\)\s*\{\s*routeMultiLineDashboardAudio\(findAvailableMultiLineAudioCall\(callId\)\)/);
});

test('resuming a caller automatically routes that caller to the dashboard', () => {
  const resume = script.slice(script.indexOf('async function resumeMultiLineCall'), script.indexOf('async function endMultiLineCall'));
  assert.match(resume, /await routeMultiLineDashboardAudio\(callId\)/);
});

console.log('dashboard auto caller audio: all tests passed');
