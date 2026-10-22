// Runs the real home-v2.html module script against stubbed DOM + Firestore, so the line-state
// behaviour (including the former videoOpen name collision and fail-open error path) is exercised.
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import vm from 'node:vm';
import { LINE, UNKNOWN_LINES, resolveLineStates } from '../lib/line-state.js';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'home-v2.html'), 'utf8');
const mod = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0][1]
  .replace(/^\s*import .*$/gm, '');                                   // imports are supplied by the harness below

function makeEl(id) { const cls = new Set(); return { id, style: {}, textContent: '',
  classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), add: c => cls.add(c), remove: c => cls.delete(c), has: c => cls.has(c) } }; }

function run(deliver) {                       // deliver(onNext, onError) simulates Firestore
  const els = {}; const get = id => (els[id] ??= makeEl(id));
  let next, error;
  const ctx = { console: { warn() {} }, document: { getElementById: get, documentElement: { dataset: {} } },
    initializeApp: () => ({}), getFirestore: () => ({}), doc: () => ({}),
    onSnapshot: (_ref, n, e) => { next = n; error = e; }, firebaseConfig: undefined,
    LINE, UNKNOWN_LINES, resolveLineStates };
  vm.runInNewContext(mod.replace('const firebaseConfig', 'var firebaseConfig'), ctx);
  const snapshot = (data, fromCache = false) => ({ data: () => data, metadata: { fromCache } });
  const state = () => ({ callOpen: get('callOpen').style.display, callClosed: get('callClosed').style.display,
    videoOpen: get('videoLink').style.display, videoClosed: get('videoClosed').style.display,
    phoneChip: get('phoneChipLabel').textContent, videoChip: get('videoChipLabel').textContent });
  return { initial: state(), after: (() => { deliver({ next, error, snapshot }); return state(); })() };
}
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('before Firestore answers: both lines unavailable, nothing open', () => {
  const r = run(() => {}); assert.equal(r.initial.callOpen, 'none'); assert.equal(r.initial.videoOpen, 'none');
  assert.equal(r.initial.phoneChip, 'Phone status unknown'); });
t('phone open, video closed -> only phone link shown (video boolean no longer fed into setEntry as an element)', () => {
  const r = run(({ next, snapshot }) => next(snapshot({ open: true, videoOpen: false })));
  assert.equal(r.after.callOpen, 'grid'); assert.equal(r.after.callClosed, 'none');
  assert.equal(r.after.videoOpen, 'none'); assert.equal(r.after.videoClosed, 'grid');
  assert.equal(r.after.phoneChip, 'Phone live'); assert.equal(r.after.videoChip, 'Video offline'); });
t('phone closed, video open', () => {
  const r = run(({ next, snapshot }) => next(snapshot({ open: false, videoOpen: true })));
  assert.equal(r.after.callOpen, 'none'); assert.equal(r.after.videoOpen, 'grid'); });
t('both open', () => {
  const r = run(({ next, snapshot }) => next(snapshot({ open: true, videoOpen: true })));
  assert.equal(r.after.callOpen, 'grid'); assert.equal(r.after.videoOpen, 'grid'); });
t('Firestore read error -> UNKNOWN, lines NOT enabled (former fail-open path)', () => {
  const r = run(({ error }) => error({ code: 'permission-denied' }));
  assert.equal(r.after.callOpen, 'none'); assert.equal(r.after.videoOpen, 'none');
  assert.equal(r.after.phoneChip, 'Phone status unknown'); assert.equal(r.after.videoChip, 'Video status unknown'); });
t('open then error -> closes again instead of staying open', () => {
  const r = run(({ next, error, snapshot }) => { next(snapshot({ open: true, videoOpen: true })); error({ code: 'unavailable' }); });
  assert.equal(r.after.callOpen, 'none'); assert.equal(r.after.videoOpen, 'none'); });
t('cache-served (offline) snapshot is UNKNOWN', () => {
  const r = run(({ next, snapshot }) => next(snapshot(undefined, true)));
  assert.equal(r.after.callOpen, 'none'); assert.equal(r.after.videoOpen, 'none'); });
console.log(`\n${n} passed`);
