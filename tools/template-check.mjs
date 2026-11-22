// يريندر فريم واحد لكل تمبليت ويعمل contact sheet للمعاينة
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { loadIconLib } from '../src/icons.mjs';

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATES = ['intro', 'question', 'body', 'zoom', 'flow', 'cycle', 'timeline', 'chart', 'layers', 'cards', 'meter'];

async function launch() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  try { return await chromium.launch({ args }); }
  catch { return await chromium.launch({ channel: 'chrome', args }); }
}

const tokens = Array.from({ length: 12 }, (_, i) => ({ word: `كلمة${i + 1}`, start: i * 0.4, end: i * 0.4 + 0.35, tone: i === 5 ? 'underline' : null }));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 0.5 });
await page.goto(pathToFileURL(path.join(ROOT, 'public', 'render.html')).href);
const fs = await import('node:fs');
const fontDir = path.join(ROOT, 'assets', 'fonts');
const css = ['IBMPlexSansArabic-700-arabic.woff2', 'IBMPlexSansArabic-500-arabic.woff2'].map((f) =>
  `@font-face{font-family:'ReelFont';font-weight:${f.includes('700') ? 700 : 500};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, f)).toString('base64')}) format('woff2');}`).join('\n');
await page.addStyleTag({ content: css });
await page.evaluate(() => document.fonts.ready);

const lib = loadIconLib();
const icons = Object.fromEntries(lib.icons.map((i) => [i.id, i]));
const framesDir = path.join(ROOT, 'out', 'templates');
fs.mkdirSync(framesDir, { recursive: true });

for (const tpl of TEMPLATES) {
  const scene = { type: tpl === 'intro' || tpl === 'question' ? tpl : 'concept', template: tpl, start: 0, end: 4, icon: 'atom', icons: ['atom', 'star', 'bolt'], label: 'معاينة تمبليت' };
  const payload = {
    width: 720, height: 1280, fps: 30, duration: 4, title: 'معاينة: ' + tpl,
    seriesTag: 'عارف ليه؟', tokens, scenes: [scene], icons,
  };
  await page.evaluate((d) => window.initRender(d), payload);
  await page.evaluate(() => window.drawFrame(2.2));
  await page.screenshot({ path: path.join(framesDir, `${tpl}.png`) });
  console.log('✔', tpl);
}
await browser.close();

// tile: 11 صورة 360×640 → شبكة 4×3 بـ xstack
const files = TEMPLATES.map((t) => path.join(framesDir, `${t}.png`));
const layout = files.map((_, i) => `${(i % 4) * 360}_${Math.floor(i / 4) * 640}`).join('|');
const fc = files.map((_, i) => `[${i}:v]scale=360:640[v${i}]`).join(';') + ';' +
  files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${layout}[out]`;
await run('ffmpeg', ['-y', ...files.flatMap((f) => ['-i', f]),
  '-filter_complex', fc, '-map', '[out]', '-frames:v', '1', path.join(ROOT, 'out', 'templates-sheet.png')], { maxBuffer: 1e7 });
console.log('🖼 out/templates-sheet.png');
