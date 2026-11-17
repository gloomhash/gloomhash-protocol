const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const grouped = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const DASH = '—';
export const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
export function fmtPrice(n) {
  if (n === null || n === undefined) return DASH;
  if (n >= 1000) return '$' + grouped.format(n);
  if (n >= 1) return '$' + n.toFixed(n >= 100 ? 2 : 3);
  if (n === 0) return '$0';
  const dec = Math.min(12, Math.max(4, -Math.floor(Math.log10(n)) + 3));
  return '$' + n.toFixed(dec);
}
export const fmtCompact = (n) => (n === null || n === undefined ? DASH : '$' + compact.format(n));
export const fmtPct = (n) => (n === null || n === undefined ? DASH : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%');
export const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a || DASH);
