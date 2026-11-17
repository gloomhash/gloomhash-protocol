// Board: row #1 is the own-token slot, rows 2-10 are trending. Ticker uses the same live market data.
import { caValue } from './register.js';
import { setNumber, reduced } from './motion.js';
import { fmtPrice, fmtCompact, fmtPct, shortAddr, DASH } from './format.js';

const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
const BRAND = () => document.body.dataset.brandLogo || 'brand/gloom-logo.png';
const PLACEHOLDER = '· · · · ·';
const STATUS = {
  loading: ['Connecting', 'Reaching the market source.'],
  live: ['Live', 'Figures are flowing off our market source.'],
  stale: ['Retrying', 'Source stalled. Prior good figures remain visible.'],
  error: ['Offline', 'Source unreachable. Retrying with longer pauses.'],
};

function letter(sym) { return (sym || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?'; }

// Logo chain: try each URL in turn, then fall back to a letter tile.
export function setLogo(tile, urls, sym, key) {
  if (tile._key === key) return;
  tile._key = key; tile.textContent = ''; tile.classList.remove('brand');
  const list = urls.filter(Boolean);
  const tileText = () => { tile.textContent = letter(sym); };
  const next = () => {
    const u = list.shift();
    if (!u) { tileText(); return; }
    const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onload = () => { tile.textContent = ''; tile.appendChild(img); };
    img.onerror = next; img.src = u;
  };
  tileText(); next();
}

function makeRow(rank, own) {
  const r = el('a', 'row spot is-skel' + (own ? ' own' : ''));
  r.setAttribute('role', 'row');
  const rk = el('span', 'c-rank', String(rank).padStart(2, '0'));
  const asset = el('div', 'c-asset'); const tile = el('span', 'tile'); const nm = el('div', 'c-name');
  nm.append(el('span', 'skel sk'), el('span', 'sym real'), el('span', 'nm real'));
  asset.append(tile, nm);
  const cell = (cls, label) => { const d = el('div', cls); if (label) d.dataset.label = label; d.append(el('span', 'skel sk'), el('span', 'num')); return d; };
  const stats = el('div', 'stats'); stats.append(cell('c-chg', '24H'), cell('c-vol', 'Volume'), cell('c-liq', 'Liquidity'));
  r.append(rk, asset, cell('c-price'), stats);
  [r.querySelector('.c-price .sk'), ...stats.querySelectorAll('.sk')].forEach((s, i) => { s.style.width = (44 + i * 8) + 'px'; });
  r._q = {
    tile, sym: r.querySelector('.sym'), nm: r.querySelector('.nm'),
    price: r.querySelector('.c-price .num'), chg: r.querySelector('.c-chg .num'), vol: r.querySelector('.c-vol .num'), liq: r.querySelector('.c-liq .num'), chgCell: r.querySelector('.c-chg'),
  };
  return r;
}

function reveal(row, i) {
  if (!row.classList.contains('is-skel')) return;
  row.style.setProperty('--dl', i * 60 + 'ms');
  row.classList.add('fresh'); row.classList.remove('is-skel');
  requestAnimationFrame(() => requestAnimationFrame(() => row.classList.remove('fresh')));
}

function fill(row, i, d, { logos, own } = {}) {
  const q = row._q;
  if (row._addr !== d.addr) {
    row._addr = d.addr;
    [q.price, q.chg, q.vol, q.liq].forEach((n) => { n._v = undefined; });
    setLogo(q.tile, logos || d.logos, d.symbol, d.addr);
  }
  q.sym.textContent = d.symbol || shortAddr(d.addr);
  q.nm.textContent = d.name || (d.symbol ? DASH : '');
  if (own && !q.sym.querySelector('.tag')) { /* tag set by renderOwn */ }
  if (d.url) { row.href = d.url; row.target = '_blank'; row.rel = 'noopener noreferrer'; row.removeAttribute('aria-disabled'); }
  setNumber(q.price, d.price, fmtPrice); setNumber(q.chg, d.chg, fmtPct); setNumber(q.vol, d.vol, fmtCompact); setNumber(q.liq, d.liq, fmtCompact);
  q.chgCell.classList.toggle('up', d.chg > 0); q.chgCell.classList.toggle('down', d.chg < 0);
  reveal(row, i);
}

function dashRow(row, i, sym, name, logoSrc) {
  const q = row._q;
  q.sym.textContent = sym; q.nm.textContent = name;
  [q.price, q.chg, q.vol, q.liq].forEach((n) => { n._v = null; n.textContent = DASH; });
  if (logoSrc) setLogo(q.tile, logoSrc, sym, 'dash:' + sym);
  row.removeAttribute('href'); row.setAttribute('aria-disabled', 'true');
  reveal(row, i);
}

export function mountBoard(market, own) {
  const host = document.getElementById('board-rows'), msg = document.getElementById('board-msg');
  if (!host) return;
  const rows = []; for (let i = 0; i < 10; i++) { const r = makeRow(i + 1, i === 0); rows.push(r); host.appendChild(r); }
  const ownRow = rows[0];
  const ca = caValue();
  ownRow.classList.add('pending');
  const mark = (txt) => { const t = el('span', 'tag', txt); return t; };

  function renderOwn() {
    const q = ownRow._q; const s = own.state;
    ownRow.querySelectorAll('.tag').forEach((t) => t.remove());
    if (!ca) { // CA absent: brand-logo placeholder, dotted data, non-clickable
      ownRow.classList.add('pending'); ownRow.classList.remove('is-skel', 'fresh');
      ownRow._addr = '__pending__';
      if (q.tile._key !== 'brand') { q.tile._key = 'brand'; q.tile.textContent = ''; q.tile.classList.add('brand'); const im = new Image(); im.src = BRAND(); im.alt = 'GLOOMHASH mark'; q.tile.appendChild(im); }
      q.sym.textContent = 'GLOOMHASH'; q.nm.textContent = 'Contract pending';
      [q.price, q.chg, q.vol, q.liq].forEach((n) => { n._v = null; n.textContent = PLACEHOLDER; });
      ownRow.removeAttribute('href'); ownRow.setAttribute('aria-disabled', 'true');
      return;
    }
    ownRow.classList.remove('pending');
    if (s.item) fill(ownRow, 0, s.item, { logos: [...s.item.logos, BRAND()], own: true });
    else if (s.status === 'error') dashRow(ownRow, 0, 'GLOOMHASH', shortAddr(ca), [BRAND()]);
    q.sym.appendChild(mark('Ours'));
  }
  own.subscribe(renderOwn);

  function renderTrending(st) {
    const list = st.items.filter((t) => !ca || t.addr !== ca).slice(0, 9); // dedupe: own token never repeats in rows 2-10
    for (let i = 1; i < 10; i++) {
      const row = rows[i], d = list[i - 1];
      if (d) fill(row, i, d);
      else if (st.status === 'error' && !st.items.length) dashRow(row, i, DASH, DASH);
    }
  }

  function renderStatus(st) {
    const [t, note] = STATUS[st.status] || STATUS.loading;
    document.querySelectorAll('[data-status-pill]').forEach((p) => { p.dataset.status = st.status; });
    document.querySelectorAll('[data-status-text]').forEach((n) => { n.textContent = t; });
    document.querySelectorAll('[data-status-note]').forEach((n) => { n.textContent = note; });
    msg.hidden = !(st.status === 'error' || st.status === 'stale');
    msg.textContent = msg.hidden ? '' : note;
  }

  market.subscribe((st) => { renderStatus(st); renderTrending(st); renderTicker(st); });
}

// ---- Ticker (same data as the board) ----
function tkItem(d) {
  const a = el('a', 'tk spot'); a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  const tile = el('span', 'tile'); setLogo(tile, d.logos, d.symbol, d.addr);
  const sym = el('b', null, d.symbol || shortAddr(d.addr));
  const px = el('span', 'tk-px', fmtPrice(d.price));
  const ch = el('span', 'tk-ch ' + (d.chg > 0 ? 'up' : ''), fmtPct(d.chg));
  a.append(tile, sym, px, ch);
  a._d = { px, ch, sym };
  return a;
}
let tickKey = '';
function renderTicker(st) {
  const track = document.getElementById('ticker-track'); if (!track) return;
  const sec = track.closest('.ticker');
  if (!st.items.length) {
    if (track.childElementCount) return;
    const set = el('div', 'ticker-set');
    for (let i = 0; i < 8; i++) { const t = el('span', 'tk'); t.append(el('span', 'skel'), el('span', 'skel')); t.firstChild.style.width = '24px'; t.lastChild.style.width = (72 + (i % 3) * 20) + 'px'; set.appendChild(t); }
    track.appendChild(set); const c = set.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c);
    return;
  }
  const key = st.items.map((d) => d.addr).join(',');
  if (key !== tickKey) {
    tickKey = key; track.textContent = '';
    const set = el('div', 'ticker-set'); st.items.forEach((d) => set.appendChild(tkItem(d)));
    track.appendChild(set);
    if (reduced()) sec.classList.add('static');
    else { const c = el('div', 'ticker-set'); c.setAttribute('aria-hidden', 'true'); st.items.forEach((d) => { const n = tkItem(d); n.tabIndex = -1; c.appendChild(n); }); track.appendChild(c); sec.classList.remove('static'); }
    return;
  }
  track.querySelectorAll('.tk').forEach((n, i) => {
    const d = st.items[i % st.items.length]; if (!n._d) return;
    n._d.px.textContent = fmtPrice(d.price); n._d.ch.textContent = fmtPct(d.chg); n._d.ch.classList.toggle('up', d.chg > 0);
  });
}
