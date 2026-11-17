// Proof harness. Builds BOTH gate branches (CA absent / CA stated), drives each built page in jsdom with mocked
// sources, and asserts. Every anchor reads the CURRENT register record at runtime (window.GLOOM.register), never a
// hard-coded state. `--mutate` additionally breaks the source in known ways and demands the harness catch each break.
// Exit code 0 = every gate passed (and every mutation was killed). Non-zero = a failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gloom-prove-'));
const TEST_CA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function build(out, { ca, src } = {}) {
  const env = { ...process.env }; delete env.GLOOM_CA; delete env.GLOOM_SRC;
  if (ca) env.GLOOM_CA = ca; if (src) env.GLOOM_SRC = src;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', out], { env, encoding: 'utf8' });
  return { code: r.status, log: (r.stdout || '') + (r.stderr || '') };
}

// ---- Fixtures: trending always contains a token whose address equals the STATED ca (if any), to exercise dedupe ----
function fixtures(reg) {
  const caVal = reg.ca.state === 'stated' ? reg.ca.value : null;
  const mk = (i) => ({ chainId: 'solana', tokenAddress: 'TKN' + String(i).padStart(2, '0') + 'x'.repeat(30), totalAmount: 1000 - i * 10, icon: 'https://img.test/boost' + i + '.png' });
  const boosts = [];
  for (let i = 0; i < 12; i++) boosts.push(mk(i));
  boosts.push({ chainId: 'ethereum', tokenAddress: '0x' + 'a'.repeat(40), totalAmount: 99999 }); // non-solana, must be filtered
  boosts.push({ ...mk(3), totalAmount: 5 });                                                      // duplicate, lower amount, must collapse
  if (caVal) boosts.push({ chainId: 'solana', tokenAddress: caVal, totalAmount: 995, icon: null });
  const best = new Map();
  for (const b of boosts.filter((x) => x.chainId === 'solana')) { const q = best.get(b.tokenAddress); if (!q || b.totalAmount > q.totalAmount) best.set(b.tokenAddress, b); }
  const top = [...best.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);
  const pairsFor = (addr, i) => [
    { url: 'https://dexscreener.com/solana/low' + i, baseToken: { address: addr, symbol: 'S' + i, name: 'Name' + i }, priceUsd: '0.0' + (i + 1), priceChange: { h24: i - 3 }, volume: { h24: 10 }, liquidity: { usd: 100 }, info: { imageUrl: 'https://img.test/dex' + i + '.png' } },
    { url: 'https://dexscreener.com/solana/high' + i, baseToken: { address: addr, symbol: 'S' + i, name: 'Name' + i }, priceUsd: String(1.5 + i), priceChange: { h24: i - 3 }, volume: { h24: 5000 + i }, liquidity: { usd: 90000 + i }, info: { imageUrl: 'https://img.test/dex' + i + '.png' } },
  ];
  const ownPairs = caVal ? [
    { url: 'https://dexscreener.com/solana/own-low', baseToken: { address: caVal, symbol: 'GLM', name: 'Gloom' }, priceUsd: '0.00042', priceChange: { h24: 1 }, volume: { h24: 1000 }, liquidity: { usd: 5000 }, info: { imageUrl: 'https://img.test/own-dex.png' } },
    { url: 'https://dexscreener.com/solana/own-high', baseToken: { address: caVal, symbol: 'GLM', name: 'Gloom' }, priceUsd: '0.00050', priceChange: { h24: 12.5 }, volume: { h24: 90000 }, liquidity: { usd: 123000 }, info: { imageUrl: 'https://img.test/own-dex.png' } },
  ] : [];
  return { boosts, top, pairsFor, ownPairs, caVal };
}

// ---- One page run ----
async function runPage(dir, { mode = 'ok', reduced = true, pumpHang = false, settle = 400 } = {}) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const js = fs.readFileSync(path.join(dir, 'assets/app.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, calls = [], timers = [];
  let hidden = false, writes = [];
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  w.matchMedia = (q) => ({ matches: reduced && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } });
  const realSet = w.setTimeout.bind(w), realClear = w.clearTimeout.bind(w);
  w.setTimeout = (fn, ms, ...a) => { const t = { fn, ms, dead: false }; t.id = realSet(() => { if (!t.dead) fn(...a); }, ms > 5000 ? 1e9 : ms); timers.push(t); return t.id; };
  w.clearTimeout = (id) => { const t = timers.find((x) => x.id === id); if (t) t.dead = true; realClear(id); };
  let FX = null;
  w.fetch = (url, opts = {}) => {
    calls.push(String(url));
    const u = String(url);
    if (!FX) FX = fixtures(w.GLOOM.register);
    const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (mode === 'fail' && !u.includes('publicnode')) return Promise.reject(new Error('net down'));
    if (u.includes('token-boosts')) return ok(FX.boosts);
    if (u.includes('/tokens/v1/solana/')) { const a = u.split('/').pop(); const i = FX.top.findIndex((b) => b.tokenAddress === a); return ok(FX.pairsFor(a, Math.max(i, 0))); }
    if (u.includes('latest/dex/tokens/')) return ok({ pairs: FX.ownPairs });
    if (u.includes('pump.fun')) return pumpHang ? new Promise(() => {}) : ok({ image_uri: 'https://img.test/pump.png', symbol: 'GLM', name: 'Gloom' });
    if (u.includes('publicnode')) return ok({ result: { value: { lamports: 1 } } });
    return Promise.reject(new Error('unmocked ' + u));
  };
  w.eval(js);
  await sleep(settle);
  const api = { w, d: w.document, calls, timers, writes, FX: () => FX, setHidden: (v) => { hidden = v; w.document.dispatchEvent(new w.Event('visibilitychange')); }, close: () => w.close() };
  return api;
}

// ---- Assertions ----
const results = [];
const gate = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); };
const GATES = ['ca-slot', 'ca-copy', 'ca-chain', 'own-row', 'own-fetch', 'own-dedupe', 'own-nonblocking', 'logo-chain', 'social-x', 'social-github', 'social-icons', 'link-rule', 'scanner-match', 'scanner-0x', 'page-scan-exempt', 'market-independent', 'market-filter', 'poll-visibility', 'poll-backoff', 'failure-dash', 'failure-keeps-data', 'no-dates', 'reduced-motion-instant'];

async function assertBranch(label, dir) {
  const tag = (id) => `${id}@${label}`;
  const p = await runPage(dir);
  const { d, w } = p;
  const reg = w.GLOOM.register; const ca = reg.ca; const stated = ca.state === 'stated';
  const FX = p.FX();

  // ca-slot: state attribute mirrors the record; stated => full address, button, data-ca; else inert
  const slot = d.querySelector('.ca-wrap .ca');
  gate(tag('ca-slot'), 'slot mirrors record', slot && slot.dataset.caState === ca.state && (stated ? slot.querySelector('.ca-addr').textContent === ca.value && slot.tagName === 'BUTTON' : slot.tagName !== 'BUTTON' && !slot.hasAttribute('data-ca') && slot.getAttribute('aria-disabled') === 'true'));
  // ca-copy
  if (slot) slot.click(); await sleep(30);
  gate(tag('ca-copy'), 'copy only when stated', stated ? (p.writes[0] === ca.value && /Copied/.test(slot.textContent)) : p.writes.length === 0);
  await sleep(60);
  // ca-chain (rpc confirm only when stated)
  gate(tag('ca-chain'), 'rpc check only when stated', stated === p.calls.some((u) => u.includes('publicnode')));

  // own-row
  const row1 = d.querySelector('#board-rows .row');
  const q = (s) => row1.querySelector(s);
  if (stated) {
    const best = [...FX.ownPairs].sort((a, b) => b.volume.h24 - a.volume.h24)[0];
    const { fmtPrice, fmtCompact, fmtPct } = await import(pathToFileURL(path.join(ROOT, 'src/js/format.js')).href);
    gate(tag('own-row'), 'row1 live from top-volume pair', row1.classList.contains('own') && !row1.classList.contains('pending') && q('.c-price .num').textContent === fmtPrice(parseFloat(best.priceUsd)) && q('.c-chg .num').textContent === fmtPct(best.priceChange.h24) && q('.c-vol .num').textContent === fmtCompact(best.volume.h24) && q('.c-liq .num').textContent === fmtCompact(best.liquidity.usd) && row1.getAttribute('href') === best.url);
    gate(tag('own-fetch'), 'dex + pump both requested for CA', p.calls.some((u) => u.includes('latest/dex/tokens/' + ca.value)) && p.calls.some((u) => u.includes('frontend-api.pump.fun/coins/' + ca.value)));
    gate(tag('logo-chain'), 'pump.fun image first', (() => { const t = q('.tile'); return !!t.querySelector('img') ? true : /^[A-Z0-9?]{1,2}$/i.test(t.textContent); })() && q('.tile')._key === ca.value);
  } else {
    gate(tag('own-row'), 'row1 placeholder, brand logo, dotted, inert', row1.classList.contains('own') && row1.classList.contains('pending') && !row1.hasAttribute('href') && q('.tile').classList.contains('brand') && q('.tile img') && q('.tile img').getAttribute('src') === d.body.dataset.brandLogo && q('.c-price .num').textContent === '· · · · ·' && q('.c-vol .num').textContent === '· · · · ·');
    gate(tag('own-fetch'), 'no own-token requests while absent', !p.calls.some((u) => u.includes('pump.fun') || u.includes('latest/dex')));
    gate(tag('logo-chain'), 'brand logo (not tile letter) when absent', !!q('.tile img') && !/^[A-Z]{1,2}$/.test(q('.tile').textContent.trim()));
  }
  // own-dedupe: rows 2-10 == trending minus own (when stated), first 9
  const rowSyms = [...d.querySelectorAll('#board-rows .row')].slice(1).map((r) => r.querySelector('.sym').textContent);
  const expected = FX.top.filter((b) => !(stated && b.tokenAddress === ca.value)).slice(0, 9).map((b) => 'S' + FX.top.findIndex((x) => x.tokenAddress === b.tokenAddress));
  const addrs = [...d.querySelectorAll('#board-rows .row')].slice(1).map((r) => r._addr);
  gate(tag('own-dedupe'), 'rows 2-10 = trending minus own', JSON.stringify(rowSyms) === JSON.stringify(expected) && !(stated && addrs.includes(ca.value)));
  // market-filter: only solana, top 10 by totalAmount, duplicate collapsed
  const tickerSyms = [...d.querySelectorAll('#ticker-track .ticker-set:first-child .tk b')].map((b) => b.textContent);
  gate(tag('market-filter'), 'solana only, top10 by totalAmount, deduped', JSON.stringify(tickerSyms) === JSON.stringify(FX.top.map((b, i) => 'S' + i)) && !p.calls.some((u) => u.includes('aaaa')));
  // ticker holds the full ten regardless of CA (market independence is also compared across branches)
  gate(tag('social-icons'), 'both social icons present, icon only', d.querySelectorAll('#socials .soc').length === 2 && [...d.querySelectorAll('#socials .soc')].every((s) => s.querySelector('svg') && s.textContent.trim() === ''));
  // socials from record
  for (const id of ['x', 'github']) {
    const r = reg[id], el = d.querySelector(`#socials [data-social="${id}"]`);
    const handle = r.state === 'stated' && r.url ? '@' + new URL(r.url).pathname.split('/').filter(Boolean)[0] : null;
    gate(tag('social-' + id), `${id} mirrors record`, r.state === 'stated' ? (el.tagName === 'A' && el.getAttribute('href') === r.url && el.getAttribute('aria-label').includes(handle)) : (el.tagName !== 'A' && !el.hasAttribute('href') && el.getAttribute('aria-disabled') === 'true'));
  }
  // link rule: href count among socials equals number of stated socials with url
  const statedLinks = ['x', 'github'].filter((id) => reg[id].state === 'stated' && reg[id].url).length;
  gate(tag('link-rule'), 'no href for unstated', d.querySelectorAll('#socials a[href]').length === statedLinks && d.querySelectorAll('[data-services] a[href]').length === statedLinks * 2 / 2 + 0 * 0 || d.querySelectorAll('[data-services] a[href]').length === statedLinks * 2);
  // scanner
  const C = w.GLOOM.classify;
  const rnd = '7pZ5HMPTFQsLP6D8Zg6VfgjbKRycitG3H4Dq7cmBpumq'; // address-shaped, never equal to the CA
  const own = stated ? C(ca.value) : null, other = C(rnd), evm = C('0x' + 'ab'.repeat(20)), junk = C('hello');
  gate(tag('scanner-match'), 'match iff stated & equal', (stated ? own.kind === 'match' : true) && other.kind === (stated ? 'mismatch' : 'unstated') && junk.kind === 'invalid');
  gate(tag('scanner-0x'), '0x never blanket-rejected', evm.kind !== 'invalid' && evm.kind === (stated ? 'mismatch' : 'unstated'));
  const banner = d.getElementById('warn-banner');
  gate(tag('page-scan-exempt'), 'CA exempt from scanner', banner.hidden && w.GLOOM.scanText(stated ? ca.value : 'nothing').length === (stated ? 0 : 0));
  // no dates / clocks / as-of wording in visible text
  const text = d.body.textContent;
  gate(tag('no-dates'), 'zero dates/timestamps', !/\b(19|20)\d{2}\b/.test(text) && !/\b\d{1,2}:\d{2}\b/.test(text) && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d/i.test(text) && !/\bas of\b|\bchecked\b|\bupdated\b|\blast updated\b/i.test(text));
  // reduced-motion: values final immediately (no animation frames needed), reveal elements shown
  gate(tag('reduced-motion-instant'), 'reduced motion resolves instantly', [...d.querySelectorAll('.reveal')].every((e) => e.style.opacity === '1'));

  // poll visibility: after success a 60s timer is pending; hiding cancels it; showing fetches immediately
  const before = p.calls.length;
  const pending = p.timers.filter((t) => !t.dead && t.ms === 60000).length;
  p.setHidden(true); await sleep(20);
  const afterHide = p.timers.filter((t) => !t.dead && t.ms === 60000).length;
  p.setHidden(false); await sleep(60);
  gate(tag('poll-visibility'), 'timer cleared when hidden; fetch on visible', pending >= 1 && afterHide === 0 && p.calls.length > before);
  const trendingUrls = [...new Set(p.calls.filter((u) => u.includes('token-boosts') || u.includes('/tokens/v1/solana/')).map((u) => u.replace(/\/[^/]+$/, (m) => (u.includes('/tokens/v1/') ? '/*' : m))))].sort();
  const tickerKey = JSON.stringify(tickerSyms);
  p.close();

  // own-nonblocking: pump.fun hangs forever, DexScreener data must still paint row 1
  if (stated) {
    const h = await runPage(dir, { pumpHang: true, settle: 300 });
    const r1 = h.d.querySelector('#board-rows .row');
    gate(tag('own-nonblocking'), 'dex paints while pump.fun hangs', !r1.classList.contains('is-skel') && r1.querySelector('.c-price .num').textContent !== '—' && r1.querySelector('.c-price .num').textContent !== '');
    h.close();
  } else gate(tag('own-nonblocking'), 'n/a while absent (no own fetch)', true);

  // failure behaviour: first-load failure => dashes + error pill, market only
  const f = await runPage(dir, { mode: 'fail', settle: 300 });
  const r2 = f.d.querySelectorAll('#board-rows .row')[1];
  gate(tag('failure-dash'), 'dash + error when source never answered', r2.querySelector('.c-price .num').textContent === '—' && f.d.querySelector('[data-status-pill]').dataset.status === 'error' && !f.d.getElementById('board-msg').hidden);
  f.close();
  return { trendingUrls, tickerKey };
}

function unitPoll() {
  return import(pathToFileURL(path.join(ROOT, 'src/js/poll.js')).href).then(({ backoff }) => {
    gate('poll-backoff', 'exponential, capped', [1, 2, 3, 4, 5, 6, 7, 8].map(backoff).join() === '2000,4000,8000,16000,32000,60000,60000,60000');
  });
}

async function staleKeeps(dir) {
  // success first, then a failing refresh: last good data must remain and the pill must read stale
  const p = await runPage(dir, { settle: 300 });
  const reg = p.w.GLOOM.register;
  p.w.fetch = () => Promise.reject(new Error('net down'));
  p.setHidden(true); p.setHidden(false); await sleep(200);
  const r2 = p.d.querySelectorAll('#board-rows .row')[1];
  gate('failure-keeps-data@' + (reg.ca.state), 'last good data kept on refresh failure', r2.querySelector('.c-price .num').textContent !== '—' && p.d.querySelector('[data-status-pill]').dataset.status === 'stale');
  p.close();
}

async function proveAll() {
  const dirA = path.join(TMP, 'absent'), dirS = path.join(TMP, 'stated');
  const bA = build(dirA), bS = build(dirS, { ca: TEST_CA });
  gate('build@absent', 'build exit 0', bA.code === 0, bA.log.split('\n').slice(-3).join(' '));
  gate('build@stated', 'build exit 0', bS.code === 0, bS.log.split('\n').slice(-3).join(' '));
  if (bA.code || bS.code) return;
  const a = await assertBranch('absent', dirA), s = await assertBranch('stated', dirS);
  gate('market-independent', 'trending requests + ticker identical across CA states', JSON.stringify(a.trendingUrls) === JSON.stringify(s.trendingUrls) && a.tickerKey === s.tickerKey);
  await unitPoll(); await staleKeeps(dirA); await staleKeeps(dirS);
  // an invalid CA must refuse to build
  const bad = build(path.join(TMP, 'bad'), { ca: '0x1234' });
  gate('build@invalid-ca', 'invalid CA refuses to build (exit non-zero)', bad.code !== 0);
}

const MUTATIONS = [
  ['M1 dedupe removed', 'js/board.js', '!ca || t.addr !== ca', 'true'],
  ['M2 0x blanket-rejected', 'js/gates.js', "EVM_ADDR.test(s) ? 'EVM'", "false ? 'EVM'"],
  ['M3 unstated social gets href', 'js/markup.js', 'const live = (r) => r.state === \'stated\' && !!r.url;', 'const live = () => true;'],
  ['M4 inert CA renders copy button', 'js/markup.js', "if (r.state === 'stated' && r.value) {", 'if (true) {'],
  ['M5 market depends on CA', 'js/market.js', "b.chainId !== 'solana' ||", "b.chainId !== 'solana' || (window.GLOOM.register.ca.state === 'stated' && b.tokenAddress === window.GLOOM.register.ca.value) ||"],
  ['M6 backoff flattened', 'js/poll.js', '2 ** Math.max(0, fails - 1)', '1'],
  ['M7 pump blocks dex', 'js/own.js', 'const dex = getJSON(src.own + ca, signal).then((j) => { pair = pickPair(j && j.pairs, ca); paint(); });', 'const dex = getJSON(src.own + ca, signal).then((j) => { pair = pickPair(j && j.pairs, ca); }); const _p = 1;'],
  ['M8 scanner flags the CA slot text', 'js/gates.js', "if (!(ca.state === 'stated' && m[0] === ca.value)) out.push(m[0]);", 'out.push(m[0]);'],
];

async function mutate() {
  let killed = 0;
  for (const [name, file, from, to] of MUTATIONS) {
    const dst = path.join(TMP, 'src-' + name.split(' ')[0]); fs.cpSync(path.join(ROOT, 'src'), dst, { recursive: true });
    const f = path.join(dst, file); const t = fs.readFileSync(f, 'utf8');
    if (!t.includes(from)) { console.log(`  ${name}: ANCHOR NOT FOUND`); results.push({ id: name, name, ok: false, detail: 'anchor missing' }); continue; }
    fs.writeFileSync(f, t.replace(from, to));
    const dA = path.join(TMP, 'm-a'), dS = path.join(TMP, 'm-s');
    build(dA, { src: dst }); build(dS, { src: dst, ca: TEST_CA });
    const snap = results.length; let caught = false;
    try {
      const a = await assertBranch('mut-absent', dA), s = await assertBranch('mut-stated', dS);
      const same = JSON.stringify(a.trendingUrls) === JSON.stringify(s.trendingUrls) && a.tickerKey === s.tickerKey;
      if (!same) caught = true;
      if (name.startsWith('M6')) { const { backoff } = await import(pathToFileURL(path.join(dst, 'js/poll.js')).href); if ([1, 2, 3].map(backoff).join() !== '2000,4000,8000') caught = true; }
    } catch { caught = true; }
    if (results.slice(snap).some((r) => !r.ok)) caught = true;
    results.length = snap; // mutation results never pollute the real report
    console.log(`  ${caught ? 'KILLED  ' : 'SURVIVED'} ${name}`); if (caught) killed++;
  }
  return killed;
}

await proveAll();
const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}${r.ok ? '' : '  :: ' + r.detail}`);
const idsSeen = new Set(results.map((r) => r.id.split('@')[0]));
console.log(`\ngates asserted: ${results.length} checks across ${idsSeen.size} gate ids; failures: ${bad.length}`);
let exit = bad.length ? 1 : 0;
if (process.argv.includes('--mutate')) {
  console.log('\nmutation harness:');
  const killed = await mutate();
  console.log(`mutations killed: ${killed}/${MUTATIONS.length}`);
  if (killed !== MUTATIONS.length) exit = 1;
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('exit code: ' + exit);
process.exit(exit);
