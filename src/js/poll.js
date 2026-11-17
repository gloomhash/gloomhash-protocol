// Shared poller: exponential backoff on failure, pause while the tab is hidden, immediate fetch on visible.
export const BASE_MS = 60000, BACKOFF_START = 2000, BACKOFF_CAP = 60000;
export const backoff = (fails) => Math.min(BACKOFF_CAP, BACKOFF_START * 2 ** Math.max(0, fails - 1));

export function createPoller(task, { onOk, onFail, onStart }) {
  let timer = null, fails = 0, inflight = false, stopped = true;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const schedule = (ms) => { clear(); if (!stopped && !document.hidden) timer = setTimeout(run, ms); };
  async function run() {
    if (inflight || stopped) return;
    inflight = true; clear();
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 15000);
    if (onStart) onStart();
    try {
      const v = await task(ac.signal);
      fails = 0; clearTimeout(to); inflight = false; onOk(v); schedule(BASE_MS);
    } catch (e) {
      fails++; clearTimeout(to); inflight = false; onFail(e, fails); schedule(backoff(fails));
    }
  }
  const onVis = () => { if (document.hidden) clear(); else if (!stopped && !inflight) run(); };
  return {
    start() { if (!stopped) return; stopped = false; document.addEventListener('visibilitychange', onVis); if (!document.hidden) run(); },
    stop() { stopped = true; clear(); document.removeEventListener('visibilitychange', onVis); },
    get fails() { return fails; },
  };
}

export async function getJSON(url, signal) {
  const r = await fetch(url, { signal, headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
