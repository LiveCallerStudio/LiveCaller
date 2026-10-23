import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

function extractFunction(name) {
  const start = dashboard.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `dashboard must define ${name}()`);
  const next = dashboard.indexOf('\nfunction ', start + 1);
  return dashboard.slice(start, next === -1 ? dashboard.length : next);
}

const cleanup = extractFunction('cleanupActiveCall');
assert.match(cleanup, /if\s*\(screeningCallId\)\s*\{[\s\S]*?try\s*\{\s*stopVideoScreening\(true\)/,
  'primary call cleanup must attempt to stop private screening');
assert.match(cleanup, /catch\s*\(err\)\s*\{[\s\S]*?screeningCallId\s*=\s*null\s*;\s*\}/,
  'a screening teardown exception must not escape the cleanup guard');
assert.ok(cleanup.indexOf('stopVideoScreening(true)') < cleanup.indexOf('clearInterval(callTimerInterval)'),
  'call timer cleanup must continue after the guarded screening teardown');
assert.match(cleanup, /if\s*\(activePc\)\s*\{\s*activePc\.close\(\);\s*activePc\s*=\s*null\s*;\s*\}/,
  'cleanup must close and clear the active caller peer connection');
assert.match(cleanup, /producerStream\.getTracks\(\)\.forEach\(t\s*=>\s*t\.stop\(\)\)/,
  'cleanup must stop producer media tracks');
assert.match(cleanup, /activeCallId\s*=\s*null\s*;\s*activeCallRef\s*=\s*null\s*;/,
  'cleanup must release the active call identifiers');
assert.match(cleanup, /callIsOnAir\s*=\s*false\s*;\s*callIsOnHold\s*=\s*false\s*;/,
  'cleanup must reset on-air and hold state');

const screening = extractFunction('stopVideoScreening');
assert.match(screening, /screeningUnsubs\.forEach/,
  'screening teardown must unsubscribe screening listeners');
assert.match(screening, /screeningPc\.close\(\)/,
  'screening teardown must close its separate peer connection');
assert.match(screening, /screeningCallId\s*=\s*null\s*;/,
  'screening teardown must clear the screening session ID');

console.log('call-cleanup regression checks: all passed');
