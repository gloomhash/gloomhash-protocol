// Own token: DexScreener and pump.fun are fetched in parallel and never block each other.
import { rec, caValue, isStated } from './register.js';
import { getJSON, createPoller } from './poll.js';
import { pickPair } from './market.js';
import { num } from './format.js';

function build(ca, pair, pf) {
  return {
    addr: ca,
    symbol: (pair && pair.baseToken && pair.baseToken.symbol) || (pf && pf.symbol) || null,
    name: (pair && pair.baseToken && pair.baseToken.name) || (pf && pf.name) || null,
    price: num(pair && pair.priceUsd), chg: num(pair && pair.priceChange && pair.priceChange.h24),
    vol: num(pair && pair.volume && pair.volume.h24), liq: num(pair && pair.liquidity && pair.liquidity.usd),
    // logo chain: pump.fun image_uri -> DexScreener -> brand/ folder -> letter tile (board appends the last two)
    logos: [pf && pf.image_uri, pair && pair.info && pair.info.imageUrl].filter(Boolean),
    url: (pair && pair.url) || 'https://dexscreener.com/solana/' + ca,
  };
}

// Both requests start together; each one paints the row the moment it lands, so neither blocks the other.
export async function fetchOwn(ca, signal, push) {
  const src = rec('market-source');
  let pair = null, pf = null;
  const paint = () => { if ((pair || pf) && push) push(build(ca, pair, pf)); };
  const dex = getJSON(src.own + ca, signal).then((j) => { pair = pickPair(j && j.pairs, ca); paint(); }); // volume.h24 desc, pairs[0]
  const pump = getJSON(src.pump + ca, signal).then((j) => { pf = j; paint(); });
  await Promise.allSettled([dex, pump]);
  if (!pair && !pf) throw new Error('both sources failed');
  return build(ca, pair, pf);
}

export function createOwn() {
  const state = { status: 'idle', item: null };
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(state));
  const ca = caValue();
  const active = !!ca && isStated('market-source');
  const poller = active ? createPoller((s) => fetchOwn(ca, s, (it) => { state.item = it; state.status = 'live'; emit(); }), {
    onOk: (it) => { state.item = it; state.status = 'live'; emit(); },
    onFail: () => { state.status = state.item ? 'stale' : 'error'; emit(); },
  }) : null;
  return {
    state, active,
    subscribe: (f) => { subs.add(f); f(state); },
    start() { if (poller) poller.start(); },
  };
}
