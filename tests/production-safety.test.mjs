import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const video = fs.readFileSync(path.join(root, 'videocall.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'SETUP.md'), 'utf8');
const voice = fs.readFileSync(path.join(root, 'voicemessage.html'), 'utf8');

assert.match(video, /resolveLineStates\(snap\)/, 'video guest page must use the shared producer line-state resolver');
assert.match(video, /if\(callMode==='video' && videoLineState!==LINE\.OPEN\)/, 'video calls must not bypass a closed or unknown producer video line');
assert.match(video, /if\(callMode==='audio' && phoneLineState!==LINE\.OPEN\)/, 'audio calls from the shared caller page must not bypass a closed or unknown phone line');
assert.match(video, /onSnapshot\(doc\(db, 'hotlineSettings', 'callLines'\)/, 'caller page must subscribe to producer line settings');
assert.match(video, /phoneLineState = LINE\.UNKNOWN;\s*videoLineState = LINE\.UNKNOWN;/, 'Firestore read errors must fail closed for live calls');
assert.match(video, /function updateLineUi\(\)/, 'line UI must reflect the currently selected call mode');
assert.match(sw, /requestUrl\.origin !== self\.location\.origin/, 'service worker must not intercept third-party requests');
assert.match(sw, /event\.request\.mode === 'navigate'/, 'offline HTML fallback must be limited to document navigations');
assert.match(sw, /manifest-songrequest\.json/, 'song request PWA manifest must be included in the app shell');
assert.match(dashboard, /\$\{escapeHtml\(typeLabels\[k\]\|\|k\)\}/, 'analytics must escape untrusted message type labels');
assert.match(dashboard, /\$\{escapeHtml\(c\.status \|\| ''\)\}/, 'call history must escape status values before HTML rendering');
assert.doesNotMatch(dashboard, /queueListenerStarted/, 'dashboard queue subscription must be restartable after sign-out');
assert.match(dashboard, /function stopQueueListener\(\)/, 'dashboard must be able to unsubscribe from the queue');
assert.match(dashboard, /function startQueueListener\(\)/, 'dashboard must be able to restart the queue subscription');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*update\s*,\s*delete\s*:\s*if\s+true/i, 'setup guide must not recommend public read/update/delete access');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*write\s*:\s*if\s+true/i, 'setup guide must not recommend public read/write access');

assert.match(voice, /playVoicemailBeep/, 'voicemail must play a start beep');
assert.match(voice, /await startRecording\(\)/, 'voicemail recording must start automatically after caller details');
assert.match(voice, /MAX_UPLOAD_BYTES = 8 \* 1024 \* 1024/, 'voice upload must enforce an 8 MB ceiling');
assert.match(voice, /AbortController/, 'voice upload must time out rather than hang indefinitely');

console.log('production-safety checks: all passed');
