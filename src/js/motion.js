// Motion: damped spring solver, scroll reveal stagger, parallax, progress bar, spotlight, count-up.
// With prefers-reduced-motion every one of these resolves instantly and installs no listeners.
export const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Damped harmonic oscillator, semi-implicit Euler with fixed sub-steps. k=stiffness, c=damping, m=mass.
export function spring(from, to, { k = 170, c = 20, m = 1, onUpdate, onDone } = {}) {
  if (reduced()) { onUpdate(to); if (onDone) onDone(); return () => {}; }
  let x = from, v = 0, last = performance.now(), raf = 0, dead = false;
  const H = 1 / 240;
  const step = (t) => {
    if (dead) return;
    let dt = Math.min(0.05, (t - last) / 1000); last = t;
    while (dt > 0) {
      const h = Math.min(H, dt); dt -= h;
      v += ((-k * (x - to) - c * v) / m) * h; x += v * h;
    }
    if (Math.abs(v) < 0.0005 && Math.abs(x - to) < 0.0005) { onUpdate(to); if (onDone) onDone(); return; }
    onUpdate(x); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

export function initReveal() {
  const els = [...document.querySelectorAll('.reveal')];
  const show = (el) => { el.style.opacity = '1'; el.style.transform = 'none'; };
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(show); return; }
  let batch = 0, resetT = 0;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target, delay = batch++ * 80;
      clearTimeout(resetT); resetT = setTimeout(() => { batch = 0; }, 160);
      setTimeout(() => spring(0, 1, {
        onUpdate: (p) => { el.style.opacity = String(clamp(p, 0, 1)); el.style.transform = 'translateY(' + ((1 - p) * 32).toFixed(2) + 'px)'; },
        onDone: () => show(el),
      }), delay);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  els.forEach((el) => io.observe(el));
}

export function initTagline() {
  const t = document.getElementById('tagline');
  if (!t || reduced() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -34% 0px' });
  const out = document.createDocumentFragment(); let n = 0;
  [...t.childNodes].forEach((node) => {
    if (node.nodeType !== 3) { out.appendChild(node); return; }
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part.trim()) { out.appendChild(document.createTextNode(part)); return; }
      const w = document.createElement('span'); w.className = 'w'; w.textContent = part;
      w.style.transitionDelay = (n++ % 5) * 60 + 'ms'; out.appendChild(w); io.observe(w);
    });
  });
  t.textContent = ''; t.appendChild(out);
}

export function initParallax() {
  const hero = document.querySelector('.hero');
  const layers = [...document.querySelectorAll('.layer')];
  layers.forEach((l) => l.style.setProperty('--d', l.dataset.depth || '0'));
  if (!hero || reduced()) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const loop = () => {
    // critically-damped follow: the layers trail the pointer, never snap to it
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    hero.style.setProperty('--px', cx.toFixed(3)); hero.style.setProperty('--py', cy.toFixed(3));
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  window.addEventListener('pointermove', (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 2; ty = (e.clientY / window.innerHeight - 0.5) * 2; kick(); }, { passive: true });
  const onScroll = () => hero.style.setProperty('--sy', String(-Math.min(window.scrollY, 800) * 0.12));
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

export function initProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  const upd = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? clamp(window.scrollY / h, 0, 1) : 0).toFixed(4) + ')';
  };
  window.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); upd();
}

export function initSpotlight(root = document) {
  if (reduced()) return;
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.spot');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

// Count-up with flash on change. First paint counts up from zero; later updates count from the previous value.
export function setNumber(el, value, fmt) {
  const prev = el._v;
  if (value === null || value === undefined) { el._v = null; el.textContent = fmt(null); return; }
  el._v = value;
  if (prev === value) { if (!el.textContent) el.textContent = fmt(value); return; }
  const from = prev === undefined || prev === null ? 0 : prev;
  if (prev !== undefined && prev !== null && !reduced()) {
    const cls = value > prev ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
  if (el._stop) el._stop();
  el._stop = spring(0, 1, {
    k: 120, c: 22,
    onUpdate: (p) => { el.textContent = fmt(from + (value - from) * clamp(p, 0, 1)); },
    onDone: () => { el.textContent = fmt(value); },
  });
}
