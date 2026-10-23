import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert.match(sw, /const CACHE_NAME = 'lcs-v41'/, 'service-worker cache must be versioned when its strategy changes');
assert.match(sw, /Promise\.all\(SHELL\.map\(async \(url\)/, 'precache must tolerate an individual missing or temporarily unavailable shell asset');
assert.doesNotMatch(sw, /cache\.addAll\(SHELL\)/, 'one failed precache request must not abort the entire service-worker install');

const navigation = sw.match(/if \(request\.mode === 'navigate'\) \{([\s\S]*?)\n  \}/);
assert.ok(navigation, 'document navigations must have a dedicated strategy');
assert.ok(navigation[1].indexOf('await fetch(request)') < navigation[1].indexOf('await cache.match(request)'),
  'navigation must try the network before returning cached HTML');
assert.match(navigation[1], /await cache\.match\('\/LiveCaller\/home-v2\.html'\)/,
  'offline navigation must fall back to the cached home page when the requested page is not cached');

assert.match(sw, /request\.method !== 'GET' \|\| requestUrl\.origin !== self\.location\.origin/,
  'non-GET and cross-origin requests must not be intercepted');
assert.match(sw, /if \(cached\) return cached;/, 'same-origin static assets should remain fast on repeat visits');
assert.match(sw, /event\.waitUntil\(cache\.put\(request, response\.clone\(\)\)\)/,
  'successful same-origin responses should refresh the cache without blocking the response');

console.log('service-worker reliability checks: all passed');
