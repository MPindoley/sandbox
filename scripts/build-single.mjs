// Builds dist/index.html: the whole site in one file (CSS, fonts, scripts, images and the film inlined),
// so it opens from disk or uploads anywhere as a single page.  Run: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const dataUri = (p) => `data:${MIME[extname(p)]};base64,${readFileSync(at(p)).toString('base64')}`;

// scripts: one classic bundle
const js = await build({
  stdin: { contents: "import './assets/js/site.js'; import './assets/js/motion.js'; import './assets/js/walk.js';", resolveDir: root },
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none',
  banner: { js: '/*! Lenis 1.1.13, MIT, (c) darkroom.engineering */' },
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// styles: fonts and site css, font files inlined
const rawCss = readFileSync(at('assets/css/fonts.css'), 'utf8') + readFileSync(at('assets/css/site.css'), 'utf8');
const css = (await transform(rawCss.replace(/url\(\.\.\/fonts\/([\w.-]+)\)/g, (_, f) => `url(${dataUri(`assets/fonts/${f}`)})`), { loader: 'css', minify: true })).code;

// the walk: its packs thinned to every second frame (the coarse pack whole), each with the frames it holds
const FRAMES = Number(readFileSync(at('index.html'), 'utf8').match(/data-frames="(\d+)"/)[1]);
const webps = (buf) => { // a pack is WebP files laid end to end, each stating its own length
  const out = [];
  for (let o = 0; o + 8 <= buf.length; o += buf.readUInt32LE(o + 4) + 8) out.push(buf.subarray(o, o + buf.readUInt32LE(o + 4) + 8));
  return out;
};
const walkSet = (set) => {
  const packs = [{ file: 'coarse.bin', frames: [...Array(Math.ceil(FRAMES / 16)).keys()].map((i) => i * 16) }];
  for (let c = 0; c * 32 < FRAMES; c++) {
    packs.push({ file: `chunk-${String(c).padStart(2, '0')}.bin`, frames: [...Array(32).keys()].map((i) => c * 32 + i).filter((i) => i < FRAMES && i % 16) });
  }
  return packs.map(({ file, frames }, k) => {
    const parts = webps(readFileSync(at(`assets/walk/${set}/${file}`)));
    if (parts.length !== frames.length) throw new Error(`assets/walk/${set}/${file}: ${parts.length} frames, expected ${frames.length}`);
    const keep = frames.map((f, j) => [f, j]).filter(([f]) => k === 0 || f % 2 === 0);
    return { frames: keep.map(([f]) => f), url: `data:application/octet-stream;base64,${Buffer.concat(keep.map(([, j]) => parts[j])).toString('base64')}` };
  });
};
const walkFrames = JSON.stringify({ d: walkSet('d'), p: walkSet('p') });

let html = readFileSync(at('index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="assets\/css\/fonts\.css">\n?/, '')
  .replace(/<link rel="stylesheet" href="assets\/css\/site\.css">/, () => `<style>${css}</style>`)
  .replace(/<script type="module" src="assets\/js\/[\w.-]+"><\/script>\n?/g, '')
  .replace(/<source src="assets\/video\/[\w.-]+\.webm" type="video\/webm">\n?\s*/g, '') // mp4 alone plays everywhere
  .replace(' data-base="assets/walk"', '')
  .replace('</body>', () => `<script>window.__walk=${walkFrames}</script>\n<script>${script}</script>\n</body>`)
  .replace(/(src|data-src|srcset|poster|href)="(assets\/(?:img|video|walk)\/[\w./-]+)"/g, (_, attr, p) => `${attr}="${dataUri(p)}"`);

const left = html.match(/["(]assets\/[^")]+/g);
if (left) throw new Error(`Unresolved local references: ${left.join(', ')}`);

mkdirSync(at('dist'), { recursive: true });
writeFileSync(at('dist/index.html'), html);
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
