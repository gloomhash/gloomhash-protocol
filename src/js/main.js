import { REG } from './register.js';
import { installGates, GATE_IDS, classify, scanText } from './gates.js';
import { createMarket } from './market.js';
import { createOwn } from './own.js';
import { mountBoard } from './board.js';
import { initReveal, initTagline, initParallax, initProgress, initSpotlight } from './motion.js';

document.documentElement.classList.add('js');
// Read-only handle for the verification harness: it reads the live register record, never a hard-coded state.
window.GLOOM = Object.freeze({ register: REG, gates: GATE_IDS, classify, scanText });

// Menu
const toggle = document.getElementById('menu-toggle'), menu = document.getElementById('menu');
function setMenu(open) {
  menu.classList.toggle('open', open); menu.inert = !open;
  toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
}
if (toggle && menu) {
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { setMenu(false); toggle.focus(); } });
}

installGates();
initProgress(); initParallax(); initTagline(); initReveal(); initSpotlight();

// Market follows the market-source record only; own-token row follows the CA record only.
const market = createMarket(), own = createOwn();
mountBoard(market, own);
market.start(); own.start();
