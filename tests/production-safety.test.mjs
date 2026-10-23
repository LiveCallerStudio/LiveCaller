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
assert.match(video, /onicecandidateerror/, 'caller WebRTC must log ICE candidate errors');
assert.match(video, /signInAnonymously\(auth\)/, 'video guest must authenticate anonymously for scoped screening rules');
assert.match(video, /screeningSessions/, 'video guest must answer a separate pre-acceptance screening peer');
assert.match(video, /guestUid/, 'video call must bind screening ownership to the guest UID');
assert.match(dashboard, /Private Guest Screening — Not On Air/, 'dashboard preview must be labeled private and off-air');
assert.match(dashboard, /data-action="video-screen"/, 'video queue must offer a screen-before-answer action');
assert.match(dashboard, /function stopVideoScreening\(/, 'producer must be able to stop the private preview independently');
assert.match(video, /pc\.connectionState === 'failed'/, 'caller must expose failed WebRTC connections');
assert.match(sw, /requestUrl\.origin !== self\.location\.origin/, 'service worker must not intercept third-party requests');
assert.match(sw, /event\.request\.mode === 'navigate'/, 'offline HTML fallback must be limited to document navigations');
assert.match(sw, /manifest-songrequest\.json/, 'song request PWA manifest must be included in the app shell');
assert.match(dashboard, /\$\{escapeHtml\(typeLabels\[k\]\|\|k\)\}/, 'analytics must escape untrusted message type labels');
assert.match(dashboard, /\$\{escapeHtml\(c\.status \|\| ''\)\}/, 'call history must escape status values before HTML rendering');
assert.doesNotMatch(dashboard, /queueListenerStarted/, 'dashboard queue subscription must be restartable after sign-out');
assert.match(dashboard, /function stopQueueListener\(\)/, 'dashboard must be able to unsubscribe from the queue');
assert.match(dashboard, /function startQueueListener\(\)/, 'dashboard must be able to restart the queue subscription');
assert.match(dashboard, /onicecandidateerror/, 'producer and OBS peers must log ICE candidate errors');
assert.match(dashboard, /RECORDING_UPLOAD_PRESET = 'djdeeze_hotline_recordings'/, 'call recordings must use a dedicated Cloudinary preset');
assert.match(dashboard, /MAX_CALL_RECORDING_BYTES = 50 \* 1024 \* 1024/, 'call recordings must enforce a 50 MB ceiling');
assert.match(dashboard, /AbortController/, 'call recording uploads must have a timeout');
assert.match(dashboard, /Unexpected Cloudinary response URL/, 'call recording uploads must validate the returned media URL');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*update\s*,\s*delete\s*:\s*if\s+true/i, 'setup guide must not recommend public read/update/delete access');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*write\s*:\s*if\s+true/i, 'setup guide must not recommend public read/write access');

assert.match(voice, /playVoicemailBeep/, 'voicemail must play a start beep');
assert.match(voice, /await startRecording\(\)/, 'voicemail recording must start automatically after caller details');
assert.match(voice, /MAX_UPLOAD_BYTES = 8 \* 1024 \* 1024/, 'voice upload must enforce an 8 MB ceiling');
assert.match(voice, /AbortController/, 'voice upload must time out rather than hang indefinitely');

console.log('production-safety checks: all passed');
