import assert from 'node:assert/strict';
import { LINE, UNKNOWN_LINES, resolveLineStates } from '../lib/line-state.js';

const snap = (data, fromCache = false) => ({ data: () => data, metadata: { fromCache } });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('both open', () => assert.deepEqual(resolveLineStates(snap({ open: true, videoOpen: true })), { phone: LINE.OPEN, video: LINE.OPEN }));
t('phone closed, video open', () => assert.deepEqual(resolveLineStates(snap({ open: false, videoOpen: true })), { phone: LINE.CLOSED, video: LINE.OPEN }));
t('phone open, video closed', () => assert.deepEqual(resolveLineStates(snap({ open: true, videoOpen: false })), { phone: LINE.OPEN, video: LINE.CLOSED }));
t('both closed', () => assert.deepEqual(resolveLineStates(snap({ open: false, videoOpen: false })), { phone: LINE.CLOSED, video: LINE.CLOSED }));
t('server doc missing -> documented legacy default open', () => assert.deepEqual(resolveLineStates(snap(undefined)), { phone: LINE.OPEN, video: LINE.OPEN }));
t('absent field -> open for that field only', () => assert.deepEqual(resolveLineStates(snap({ open: false })), { phone: LINE.CLOSED, video: LINE.OPEN }));
t('cache-served snapshot is UNKNOWN (offline looks like missing doc)', () => assert.deepEqual(resolveLineStates(snap(undefined, true)), UNKNOWN_LINES));
t('cache-served snapshot with data is still UNKNOWN', () => assert.deepEqual(resolveLineStates(snap({ open: true, videoOpen: true }, true)), UNKNOWN_LINES));
t('non-boolean value is UNKNOWN, not open', () => assert.deepEqual(resolveLineStates(snap({ open: 'false', videoOpen: null })), { phone: LINE.UNKNOWN, video: LINE.UNKNOWN }));
t('no snapshot (read error path) is UNKNOWN', () => assert.deepEqual(resolveLineStates(undefined), UNKNOWN_LINES));
console.log(`\n${n} passed`);
