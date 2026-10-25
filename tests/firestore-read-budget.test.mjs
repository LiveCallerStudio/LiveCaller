import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const overlay = readFileSync(new URL('../overlay.html', import.meta.url), 'utf8');
const songOverlay = readFileSync(new URL('../song-overlay.html', import.meta.url), 'utf8');

assert.match(dashboard, /where, limit, onSnapshot/, 'dashboard imports Firestore query filters and limits');
assert.match(dashboard, /query\(collection\(db, 'liveCalls'\), where\('status', '==', 'waiting'\), limit\(50\)\)/, 'dashboard watches only a bounded waiting-call queue');
assert.match(dashboard, /query\(collection\(db, 'callHistory'\), orderBy\('createdAt', 'desc'\), limit\(100\)\)/, 'call history live listener is bounded');
assert.match(dashboard, /query\(collection\(db, 'songRequests'\), orderBy\('createdAt', 'desc'\), limit\(100\)\)/, 'dashboard song request listener is bounded');
assert.match(dashboard, /query\(collection\(db, 'hotlineMessages'\), orderBy\('createdAt', 'desc'\), limit\(100\)\)/, 'dashboard message listener is bounded');
assert.match(dashboard, /let linesSettingsUnsub = null[\s\S]*?function stopLinesSettingsListener\(\)[\s\S]*?linesSettingsUnsub\(\)/, 'shared line settings listener can be cleaned up');
assert.match(dashboard, /let callHistoryUnsubscribe = null[\s\S]*?function stopCallHistoryListener\(\)[\s\S]*?callHistoryUnsubscribe\(\)/, 'call history listener can be cleaned up');
assert.match(dashboard, /stopCallHistoryListener\(\);[\s\S]*?stopLinesSettingsListener\(\);/, 'sign-out releases non-call listeners');
assert.equal((overlay.match(/onSnapshot\(query\(collection\(db, 'liveCalls'/g) || []).length, 1, 'OBS overlay uses one shared waiting-call listener for audio and video counters');
assert.match(overlay, /where\('status', '==', 'waiting'\), limit\(50\)/, 'OBS overlay waiting-call listener is filtered and bounded');
assert.match(overlay, /query\(collection\(db,'hotlineMessages'\), orderBy\('createdAt','desc'\), limit\(100\)\)/, 'OBS overlay message counter does not read the full collection');
assert.match(songOverlay, /orderBy\('createdAt', 'desc'\), limit\(50\)/, 'song OBS overlay queue listener is bounded');

console.log('Firestore read-budget regression checks: all passed');
