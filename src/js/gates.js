// Gates: every branch reads the live register record at runtime. Nothing here caches a state.
import { REG, rec, isStated, caValue, SOL_ADDR, EVM_ADDR } from './register.js';
import { socialsHTML, servicesHTML, caSlotHTML } from './markup.js';
import { shortAddr } from './format.js';

export const GATE_IDS = ['ca-slot', 'ca-copy', 'ca-chain', 'own-row', 'own-fetch', 'social-x', 'social-github', 'scanner', 'page-scan', 'market-independent'];

// Rule 3: address-shaped strings are matched against the stated registry. Shape alone never rejects (0x included).
export function classify(raw, R = REG) {
  const s = (raw || '').trim();
  if (!s) return { kind: 'idle', msg: 'Awaiting input.' };
  const shape = SOL_ADDR.test(s) ? 'Solana' : EVM_ADDR.test(s) ? 'EVM' : null;
  if (!shape) return { kind: 'invalid', msg: 'Not address-shaped, so there is nothing to compare.' };
  const ca = R.ca || { state: 'absent' };
  if (ca.state === 'stated' && ca.value) {
    const same = shape === 'EVM' ? s.toLowerCase() === String(ca.value).toLowerCase() : s === ca.value;
    return same
      ? { kind: 'match', msg: 'Exact match with the stated GLOOMHASH contract.' }
      : { kind: 'mismatch', msg: `Does not match the stated contract. Treat this ${shape}-shaped address as not GLOOMHASH.` };
  }
  return { kind: 'unstated', msg: `No contract is stated yet, this ${shape}-shaped string stays unverified; registry data cannot vouch for it.` };
}

// Page scan: finds address-shaped strings in prose; the contract slot is exempt (data-ca-exempt).
export function scanText(text, R = REG) {
  const out = [], ca = R.ca || { state: 'absent' };
  const re = /(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/g; let m;
  while ((m = re.exec(text))) { if (!(ca.state === 'stated' && m[0] === ca.value)) out.push(m[0]); }
  return out;
}
function scanPage() {
  const root = document.getElementById('main'); if (!root) return [];
  const found = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('[data-ca-exempt],#board-rows,#ticker-track,pre,script,#verdict,#scan-input') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (w.nextNode()) found.push(...scanText(w.currentNode.textContent));
  const b = document.getElementById('warn-banner');
  if (b) { b.hidden = !found.length; b.textContent = found.length ? 'Address-shaped text appeared on this page outside the registry. Do not trust it.' : ''; }
  return found;
}

function copyText(text, onDone, fallbackEl) {
  const sel = () => { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); onDone(false); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => onDone(true), sel); else sel();
}

function wireCA() {
  const wrap = document.querySelector('.ca-wrap'); if (!wrap) return;
  wrap.innerHTML = caSlotHTML(REG); // runtime is authoritative over the static markup
  const ca = caValue();
  document.documentElement.dataset.caState = rec('ca').state;
  document.querySelectorAll('[data-spec-ca]').forEach((n) => { n.textContent = ca ? shortAddr(ca) : 'Pending'; });
  const b = wrap.querySelector('[data-ca]'); if (!b || !ca) return;
  const word = b.querySelector('[data-ca-do]'), full = b.querySelector('.ca-addr'), live = b.querySelector('[data-ca-live]');
  b.addEventListener('click', () => copyText(ca, (ok) => {
    word.textContent = ok ? 'Copied' : 'Select and copy'; live.textContent = ok ? 'Contract address copied' : 'Select the address and copy it';
    b.classList.toggle('ok', ok);
    setTimeout(() => { word.textContent = 'Copy'; b.classList.remove('ok'); live.textContent = ''; }, 1800);
  }, full));
  // Chain gate: confirm the account exists on Solana mainnet (the stated RPC). Silent on failure.
  const chain = rec('chain');
  if (chain.state === 'stated' && chain.rpc) {
    fetch(chain.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [ca, { encoding: 'base64' }] }) })
      .then((r) => r.json()).then((j) => { if (j && j.result && j.result.value) b.querySelector('[data-ca-chain]').classList.add('on'); }).catch(() => {});
  }
}

function wireSocials() {
  const s = document.getElementById('socials'); if (s) s.innerHTML = socialsHTML(REG);
  document.querySelectorAll('[data-services]').forEach((ul) => { ul.innerHTML = servicesHTML(REG, ul.dataset.services); });
}

function wireScanner() {
  const f = document.getElementById('scan-form'), i = document.getElementById('scan-input'), v = document.getElementById('verdict');
  if (!f) return;
  const run = () => { const r = classify(i.value); v.dataset.kind = r.kind; v.textContent = r.msg; };
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  i.addEventListener('input', run);
}

function wireTabs() {
  const pick = { way: 'check', os: 'win' };
  const show = () => {
    document.querySelectorAll('[data-way]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.way === pick.way)));
    document.querySelectorAll('[data-os]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.os === pick.os)));
    const key = pick.way + '-' + pick.os;
    document.querySelectorAll('[data-how]').forEach((p) => { p.hidden = !p.dataset.how.split(' ').includes(key); });
    document.querySelectorAll('[data-os-tabs]').forEach((t) => { t.hidden = pick.way === 'check'; });
  };
  document.querySelectorAll('[data-way]').forEach((b) => b.addEventListener('click', () => { pick.way = b.dataset.way; show(); }));
  document.querySelectorAll('[data-os]').forEach((b) => b.addEventListener('click', () => { pick.os = b.dataset.os; show(); }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const pre = document.getElementById(b.dataset.copy);
    copyText(pre.textContent, (ok) => { b.textContent = ok ? 'Copied' : 'Select and copy'; b.classList.toggle('ok', ok); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('ok'); }, 1800); }, pre);
  }));
  show();
}

export function installGates() {
  wireSocials(); wireCA(); wireScanner(); wireTabs();
  scanPage();
  void isStated;
}
