// Market: follows ONLY the 'market-source' register record. CA state has zero effect on anything in this file.
import { rec, isStated } from './register.js';
import { getJSON, createPoller } from './poll.js';
import { num } from './format.js';

export function pickPair(pairs, addr) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const mine = pairs.filter((p) => p && p.baseToken && p.baseToken.address === addr);
  const pool = mine.length ? mine : pairs;
  return [...pool].sort((a, b) => (num(b && b.volume && b.volume.h24) ?? -1) - (num(a && a.volume && a.volume.h24) ?? -1))[0];
}
export function toItem(addr, pair, boost) {
  const g = (o, ...k) => k.reduce((x, key) => (x == null ? x : x[key]), o);
  return {
    addr, boost: boost ? boost.totalAmount ?? null : null,
    symbol: g(pair, 'baseToken', 'symbol') ?? null, name: g(pair, 'baseToken', 'name') ?? null,
    price: num(g(pair, 'priceUsd')), chg: num(g(pair, 'priceChange', 'h24')), vol: num(g(pair, 'volume', 'h24')), liq: num(g(pair, 'liquidity', 'usd')),
    logos: [g(pair, 'info', 'imageUrl'), boost && boost.icon].filter(Boolean),
    url: (pair && pair.url) || 'https://dexscreener.com/solana/' + addr,
  };
}

export async function fetchTrending(signal) {
  const src = rec('market-source');
  const boosts = await getJSON(src.boosts, signal);
  if (!Array.isArray(boosts)) throw new Error('bad boost payload');
  const best = new Map();
  for (const b of boosts) {
    if (!b || b.chainId !== 'solana' || !b.tokenAddress) continue;
    const prev = best.get(b.tokenAddress);
    if (!prev || (b.totalAmount ?? 0) > (prev.totalAmount ?? 0)) best.set(b.tokenAddress, b);
  }
  const top = [...best.values()].sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0)).slice(0, 10);
  if (!top.length) throw new Error('no solana boosts');
  const res = await Promise.allSettled(top.map((b) => getJSON(src.tokens + b.tokenAddress, signal)));
  if (res.every((r) => r.status === 'rejected')) throw new Error('pair lookups failed');
  return top.map((b, i) => toItem(b.tokenAddress, res[i].status === 'fulfilled' ? pickPair(res[i].value, b.tokenAddress) : null, b));
}

export function createMarket() {
  const state = { status: 'loading', items: [], error: null };
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(state));
  const inert = !isStated('market-source');
  const poller = createPoller(fetchTrending, {
    onStart: () => { if (!state.items.length) { state.status = 'loading'; emit(); } },
    onOk: (items) => { state.items = items; state.status = 'live'; state.error = null; emit(); },
    onFail: (e) => { state.error = e; state.status = state.items.length ? 'stale' : 'error'; emit(); },
  });
  return {
    state,
    subscribe: (f) => { subs.add(f); f(state); return () => subs.delete(f); },
    start() { if (inert) { state.status = 'error'; state.error = new Error('market source not stated'); emit(); return; } poller.start(); },
    stop: () => poller.stop(),
  };
}
