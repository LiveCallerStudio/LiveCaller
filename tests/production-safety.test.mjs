import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const video = fs.readFileSync(path.join(root, 'videocall.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

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

console.log('production-safety checks: all passed');
