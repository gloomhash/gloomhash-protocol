// Pure string markup shared by the build (static HTML, works without JS) and the runtime (authoritative re-render).
// Input is always the register's records. Absent / unconfirmed records render inert: no href, no copy handler.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SOCIALS = [
  { id: 'x', label: 'X', icon: 'i-x', off: 'Not linked' },
  { id: 'github', label: 'GitHub', icon: 'i-github', off: 'Not published' },
];
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const get = (R, id) => R[id] || { state: 'absent' };
const live = (r) => r.state === 'stated' && !!r.url;

// Link rule: store the URL, derive the handle.
export function handleFrom(r) {
  if (!live(r)) return null;
  try { return '@' + new URL(r.url).pathname.split('/').filter(Boolean)[0]; } catch { return null; }
}

export function socialsHTML(R) {
  return SOCIALS.map((s) => {
    const r = get(R, s.id);
    if (live(r)) {
      const h = handleFrom(r);
      return `      <a class="soc" data-social="${s.id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}${h ? ' ' + esc(h) : ''}">${icon(s.icon)}</a>`;
    }
    return `      <span class="soc" data-social="${s.id}" data-state="${esc(r.state)}" role="img" aria-disabled="true" aria-label="${s.label}, ${s.off.toLowerCase()}">${icon(s.icon)}</span>`;
  }).join('\n');
}

export function servicesHTML(R, kind) {
  return SOCIALS.map((s) => {
    const r = get(R, s.id), on = live(r), h = handleFrom(r);
    if (kind === 'stores') {
      return on
        ? `<li data-social="${s.id}" data-state="stated">${icon(s.icon)}<b>${s.label}</b><a class="link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(h || 'Open')}</a></li>`
        : `<li data-social="${s.id}" data-state="${esc(r.state)}">${icon(s.icon)}<b>${s.label}</b><span class="link" aria-disabled="true">${s.off}</span></li>`;
    }
    return on
      ? `<li data-social="${s.id}" data-state="stated"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${s.label}${icon('i-out')}</a></li>`
      : `<li data-social="${s.id}" data-state="${esc(r.state)}"><span class="svc" aria-disabled="true">${s.label}<span>${s.off}</span></span></li>`;
  }).join('\n');
}

export function caSlotHTML(R) {
  const r = get(R, 'ca');
  if (r.state === 'stated' && r.value) {
    return `<button class="ca" type="button" data-ca-state="stated" data-ca="${esc(r.value)}" aria-label="Copy contract address ${esc(r.value)}"><span class="label">CA</span><span class="ca-addr" data-ca-exempt>${esc(r.value)}</span><span class="ca-do label" data-ca-do>Copy</span><span class="ca-chain label" data-ca-chain>On-chain account found</span><span class="sr-only" role="status" data-ca-live></span></button>`;
  }
  return `<div class="ca" data-ca-state="${esc(r.state)}" role="group" aria-disabled="true" aria-label="Contract address not stated"><span class="label">CA</span><span class="ca-addr" data-ca-exempt>· · · · · awaiting announcement · · · · ·</span><span class="ca-do label">Inert</span></div>`;
}
