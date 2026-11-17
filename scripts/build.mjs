// Build: src/ -> dist/ (deploy output). Usage: node scripts/build.mjs [--out dir]   env GLOOM_CA=<mint> states the contract.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import sharp from 'sharp';
import { socialsHTML, servicesHTML, caSlotHTML } from '../src/js/markup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, argOut > -1 ? process.argv[argOut + 1] : 'dist');
const fail = (m) => { console.error('BUILD FAIL: ' + m); process.exit(1); };
const P = (...a) => path.join(ROOT, ...a);
const SRC = process.env.GLOOM_SRC ? path.resolve(process.env.GLOOM_SRC) : P('src'); // harness mutates a copy of src, never the real one

// ---- Register (single source of truth); GLOOM_CA flips the ca record to "stated" ----
const reg = JSON.parse(fs.readFileSync(path.join(SRC, 'register.json'), 'utf8'));
const ca = (process.env.GLOOM_CA || '').trim();
if (ca) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca)) fail('GLOOM_CA is not a base58 Solana address');
  reg.records.ca = { state: 'stated', value: ca };
}
const R = reg.records;
for (const [id, r] of Object.entries(R)) if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) fail(`register record ${id} has invalid state`);

fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['assets', 'brand']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// ---- Tokens: colours for the favicon come from tokens.css, never typed here ----
const tokens = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8');
const tok = (name) => (tokens.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1] || fail('token missing: ' + name);
const FG = tok('fg'), BG = tok('bg');

// ---- CSS ----
const css = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8') + '\n' + fs.readFileSync(path.join(SRC, 'styles/main.css'), 'utf8');
const minCss = await esbuild.transform(css, { loader: 'css', minify: true });
fs.writeFileSync(path.join(OUT, 'assets/app.css'), minCss.code);

// ---- JS (register injected as a literal) ----
await esbuild.build({
  entryPoints: [path.join(SRC, 'js/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2020',
  outfile: path.join(OUT, 'assets/app.js'), define: { __REGISTER__: JSON.stringify(reg) },
  legalComments: 'none', logLevel: 'error',
});

// ---- Logo: transparent PNG has pure-black transparent regions, so every resize is premultiplied.
// sharp composites premultiplied-alpha before the resampler and un-premultiplies after; the check below proves no dark fringe.
const SRC_LOGO = P('brand', 'LOGO GLOOM PNG...png');
if (!fs.existsSync(SRC_LOGO)) fail('brand logo missing');
const BOX = { left: 455, top: 454, width: 1084, height: 1084 }; // glyph bbox 495..1499 x 499..1493 plus margin
const base = sharp(SRC_LOGO).ensureAlpha().extract(BOX);
const sizes = { 'assets/logo-640.png': 640, 'assets/logo-180.png': 180, 'brand/gloom-logo.png': 256 };
for (const [rel, px] of Object.entries(sizes)) {
  await base.clone().resize(px, px, { kernel: 'lanczos3', fit: 'fill' }).png({ compressionLevel: 9 }).toFile(path.join(OUT, rel));
}
{ // fringe proof: semi-transparent pixels must stay light, not darken toward the black stored under alpha 0
  const { data, info } = await sharp(path.join(OUT, 'assets/logo-640.png')).raw().toBuffer({ resolveWithObject: true });
  let n = 0, sum = 0;
  for (let i = 0; i < info.width * info.height; i++) { const a = data[i * 4 + 3]; if (a > 8 && a < 247) { n++; sum += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; } }
  const mean = n ? sum / n : 255;
  console.log(`logo fringe check: ${n} edge px, mean RGB ${mean.toFixed(1)} (premultiplied resize ${mean > 235 ? 'OK' : 'FAIL'})`);
  if (mean <= 235) fail('dark fringe detected in resized logo');
}
fs.copyFileSync(SRC_LOGO, path.join(OUT, 'brand/gloom-logo-source.png')); // explicit byte copy of the original asset
fs.copyFileSync(P('reference', 'SAMPUL GLOOM JPG.jpg.jpeg'), path.join(OUT, 'assets/og.jpg'));

// ---- Favicon: SVG 32x32 traced from the real pixel grid of the logo ----
{
  const PAD = 1.08, side = Math.round(1004 * PAD), cx = 997, cy = 996;
  const { data } = await sharp(SRC_LOGO).ensureAlpha()
    .extract({ left: cx - (side >> 1), top: cy - (side >> 1), width: side, height: side })
    .resize(32, 32, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let y = 0; y < 32; y++) {
    let x = 0;
    while (x < 32) {
      if (data[(y * 32 + x) * 4 + 3] >= 128) { let w = 0; while (x + w < 32 && data[(y * 32 + x + w) * 4 + 3] >= 128) w++; rows.push(`M${x} ${y}h${w}v1h-${w}z`); x += w; } else x++;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" rx="6" fill="${BG}"/><path fill="${FG}" d="${rows.join('')}"/></svg>\n`;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg);
  console.log(`favicon.svg traced: ${rows.length} runs from 32x32 grid`);
}

// ---- HTML ----
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace('{{SOCIALS}}', socialsHTML(R)).replace('{{CA_SLOT}}', caSlotHTML(R))
  .replace('{{SERVICES}}', servicesHTML(R, 'stores')).replace('{{SERVICES_FOOT}}', servicesHTML(R, 'foot'));
if (/\{\{[A-Z_]+\}\}/.test(html)) fail('unfilled template slot');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- Verify: logo present in dist and referenced with correct relative paths ----
const need = ['brand/gloom-logo.png', 'brand/gloom-logo-source.png', 'assets/logo-640.png', 'assets/logo-180.png', 'assets/app.js', 'assets/app.css', 'favicon.svg', 'assets/og.jpg'];
for (const f of need) if (!fs.existsSync(path.join(OUT, f)) || fs.statSync(path.join(OUT, f)).size < 100) fail('missing in output: ' + f);
for (const ref of ['brand/gloom-logo.png', 'assets/logo-640.png', 'assets/app.js', 'assets/app.css', 'favicon.svg']) {
  if (!html.includes(ref)) fail('index.html does not reference ' + ref);
  if (html.includes('"/' + ref)) fail('absolute path for ' + ref);
}
const hdr = fs.readFileSync(path.join(OUT, 'brand/gloom-logo.png')).subarray(0, 8).toString('hex');
if (hdr !== '89504e470d0a1a0a') fail('logo in dist is not a PNG');
console.log(`logo in dist: brand/gloom-logo.png (${fs.statSync(path.join(OUT, 'brand/gloom-logo.png')).size} B), referenced from index.html`);
console.log(`built -> ${path.relative(ROOT, OUT) || '.'} | ca=${R.ca.state} x=${R.x.state} github=${R.github.state} market=${R['market-source'].state}`);
