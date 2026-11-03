// Builds dist/index.html: the whole site in one file (CSS, fonts, scripts, images and the film inlined),
// so it opens from disk or uploads anywhere as a single page.  Run: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
const dataUri = (p) => `data:${MIME[extname(p)]};base64,${readFileSync(at(p)).toString('base64')}`;

// scripts: one classic bundle; three.js comes from its npm source (same version as the vendored build) so unused parts drop out
const js = await build({
  stdin: { contents: "import './assets/js/site.js'; import './assets/js/motion.js'; import './assets/js/glass.js';", resolveDir: root },
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none',
  banner: { js: '/*! three.js r170, MIT, (c) 2010-2024 three.js authors. Lenis 1.1.13, MIT, (c) darkroom.engineering */' },
  alias: { three: at('node_modules/three/src/Three.js') },
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// styles: fonts and site css, font files inlined
const rawCss = readFileSync(at('assets/css/fonts.css'), 'utf8') + readFileSync(at('assets/css/site.css'), 'utf8');
const css = (await transform(rawCss.replace(/url\(\.\.\/fonts\/([\w.-]+)\)/g, (_, f) => `url(${dataUri(`assets/fonts/${f}`)})`), { loader: 'css', minify: true })).code;

let html = readFileSync(at('index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="assets\/css\/fonts\.css">\n?/, '')
  .replace(/<link rel="stylesheet" href="assets\/css\/site\.css">/, () => `<style>${css}</style>`)
  .replace(/<script type="importmap">.*?<\/script>\n?/s, '')
  .replace(/<script type="module" src="assets\/js\/[\w.-]+"><\/script>\n?/g, '')
  .replace(/<source src="assets\/video\/[\w.-]+\.webm" type="video\/webm">\n?\s*/g, '') // mp4 alone plays everywhere
  .replace('</body>', () => `<script>${script}</script>\n</body>`)
  .replace(/(src|srcset|poster|href)="(assets\/(?:img|video)\/[\w.-]+)"/g, (_, attr, p) => `${attr}="${dataUri(p)}"`);

const left = html.match(/["(]assets\/[^")]+/g);
if (left) throw new Error(`Unresolved local references: ${left.join(', ')}`);

mkdirSync(at('dist'), { recursive: true });
writeFileSync(at('dist/index.html'), html);
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
