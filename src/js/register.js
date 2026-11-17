// Register: every external fact is ONE record with a state. Absent / unconfirmed render inert.
// The object is injected at build time (scripts/build.mjs) so the page and the harness read the same record.
/* global __REGISTER__ */
const raw = typeof __REGISTER__ !== 'undefined' ? __REGISTER__ : { records: {} };
export const REG = raw.records;
export const STATES = ['stated', 'absent', 'unconfirmed'];

export const rec = (id) => REG[id] || { state: 'absent' };
export const isStated = (id) => rec(id).state === 'stated';

// Link rule: the URL is stored, the handle is derived, and nothing without a stated record gets an href.
export const hrefOf = (id) => (isStated(id) && rec(id).url ? rec(id).url : null);
export function handleOf(id) {
  const u = hrefOf(id);
  if (!u) return null;
  try { return '@' + new URL(u).pathname.split('/').filter(Boolean)[0]; } catch { return null; }
}
export const caValue = () => (isStated('ca') ? rec('ca').value : null);
export const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
