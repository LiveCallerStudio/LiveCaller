// Parses every inline <script> and the lib/ + sw.js files; validates manifests; checks local href/src targets exist.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import os from 'node:os';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fail = 0; const bad = (m) => { fail++; console.log('FAIL', m); };
function findHtml(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !['.git', 'node_modules'].includes(entry.name)) found.push(...findHtml(path.join(dir, entry.name)));
    else if (entry.isFile() && entry.name.endsWith('.html')) found.push(path.relative(root, path.join(dir, entry.name)));
  }
  return found;
}
for (const rel of findHtml(root)) {
  const f = path.join(root, rel);
  const h = fs.readFileSync(f, 'utf8');
  [...h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    const tmp = path.join(os.tmpdir(), `chk-${rel.replace(/[\\/]/g, '-')}-${i}.mjs`); fs.writeFileSync(tmp, m[2]);
    try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); } catch (e) { bad(`${f} script #${i}: ${e.stderr.toString().split('\n')[0]}`); }
  });
  for (const m of h.matchAll(/(?:href|src)="(?!https?:|#|data:|mailto:|tel:|javascript:|\$\{)([^"?#$]+)/g))
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) bad(`${rel}: missing local reference ${m[1]}`);
}
for (const f of ['sw.js', 'lib/line-state.js']) {
  const tmp = path.join(os.tmpdir(), `chk-${path.basename(f, '.js')}.mjs`);
  try {
    fs.writeFileSync(tmp, fs.readFileSync(path.join(root, f), 'utf8'));
    execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
  } catch (e) { bad(f); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch { bad(f); } }
console.log(fail ? `${fail} failure(s)` : 'syntax/manifests/local refs: all passed'); process.exit(fail ? 1 : 0);
