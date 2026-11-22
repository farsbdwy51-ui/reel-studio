import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');

export async function ffprobeDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(stdout.trim());
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none'];
  try {
    return await chromium.launch({ args });
  } catch {
    // فولباك: كروم النظام لو تحميل كروميوم فشل
    return await chromium.launch({ channel: 'chrome', args });
  }
}

// جهّز @font-face من فولدر الخط (إعدادات) أو الخط المدمج IBM Plex Sans Arabic
function fontFaceCss(fontFolder) {
  let files = [];
  if (fontFolder && fs.existsSync(fontFolder)) {
    files = fs.readdirSync(fontFolder).filter((f) => /\.(woff2|ttf|otf)$/i.test(f)).map((f) => path.join(fontFolder, f));
  }
  if (!files.length) {
    files = [
      path.join(FONTS_DIR, 'IBMPlexSansArabic-400-arabic.woff2'),
      path.join(FONTS_DIR, 'IBMPlexSansArabic-500-arabic.woff2'),
      path.join(FONTS_DIR, 'IBMPlexSansArabic-700-arabic.woff2'),
      path.join(FONTS_DIR, 'IBMPlexSansArabic-400-latin.woff2'),
      path.join(FONTS_DIR, 'IBMPlexSansArabic-700-latin.woff2'),
    ].filter((f) => fs.existsSync(f));
  }
  const weightOf = (f) => (/700|bold/i.test(f) ? 700 : /500|medium/i.test(f) ? 500 : 400);
  return files.map((f) => {
    const b64 = fs.readFileSync(f).toString('base64');
    const fmt = f.endsWith('.woff2') ? 'woff2' : f.endsWith('.ttf') ? 'truetype' : 'opentype';
    return `@font-face{font-family:'ReelFont';font-weight:${weightOf(f)};src:url(data:font/${fmt};base64,${b64}) format('${fmt}');}`;
  }).join('\n');
}

export async function renderVideo({ payload, voicePath, dir, fontFolder, signal, onProgress, onPreview, log }) {
  const framesDir = path.join(dir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const fps = payload.fps || 30;
  const total = Math.max(1, Math.round(payload.duration * fps));

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: payload.width, height: payload.height },
      deviceScaleFactor: 1.5, // 720×1280 → 1080×1920
    });
    await page.goto(pathToFileURL(path.join(ROOT, 'public', 'render.html')).href);
    await page.addStyleTag({ content: fontFaceCss(fontFolder) });
    await page.evaluate(async () => { await document.fonts.load('700 40px ReelFont'); await document.fonts.ready; });
    await page.evaluate((data) => window.initRender(data), payload);

    for (let f = 0; f < total; f++) {
      if (signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      const t = f / fps;
      await page.evaluate((tt) => window.drawFrame(tt), t);
      const name = path.join(framesDir, `f${String(f).padStart(4, '0')}.png`);
      await page.screenshot({ path: name, type: 'png' });
      if (onProgress && (f % 5 === 0 || f === total - 1)) onProgress(f + 1, total);
      if (onPreview && f % 10 === 0) {
        const buf = await page.screenshot({ type: 'jpeg', quality: 55 });
        onPreview(buf.toString('base64'));
      }
    }
  } finally {
    await browser.close();
  }
  log('الفريمات خلصت — بيتحول لفيديو وبيتركب الصوت');

  const audioPath = await buildAudio({ voicePath, payload, dir, log });

  const video = path.join(dir, 'out.mp4');
  await run('ffmpeg', [
    '-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f%04d.png'),
    '-i', audioPath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', video,
  ], { maxBuffer: 1024 * 1024 * 8 });

  const contactSheet = path.join(dir, 'contact-sheet.png');
  const tiles = Math.min(10, Math.max(1, Math.ceil(payload.duration)));
  await run('ffmpeg', [
    '-y', '-i', video,
    '-vf', `fps=1,scale=270:480,tile=${tiles}x1:padding=4:margin=4`,
    '-frames:v', '1', contactSheet,
  ], { maxBuffer: 1024 * 1024 * 8 });

  fs.rmSync(framesDir, { recursive: true, force: true });
  return { video, contactSheet };
}

// يبني whoosh على قطع المشاهد وتيك على الكلمات المؤكدة، ويميكسهم مع الصوت ويعمل normalize لـ -14 LUFS
async function buildAudio({ voicePath, payload, dir, log }) {
  const duration = payload.duration;
  const cuts = (payload.scenes || []).slice(1).map((s) => s.start).filter((t) => t > 0.05 && t < duration - 0.2);
  const ticks = (payload.tokens || []).filter((t) => t.tone).map((t) => t.start).filter((t) => t > 0.05 && t < duration - 0.1).slice(0, 10);

  const whoosh = path.join(dir, 'sfx-whoosh.wav');
  const tick = path.join(dir, 'sfx-tick.wav');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.45:seed=7:sample_rate=44100',
    '-af', "highpass=f=250,lowpass=f=2600,volume='0.5*sin(3.14159*min(t\\,0.45)/0.45)':eval=frame", whoosh]);
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1900:duration=0.07:sample_rate=44100',
    '-af', 'afade=t=out:st=0:d=0.06,volume=0.35', tick]);

  // تراكب SFX واحد
  const sfxInputs = [];
  const pre = [];
  const labels = ['[0:a]'];
  let n = 1;
  for (const t of cuts) { sfxInputs.push('-i', whoosh); const ms = Math.round(t * 1000); pre.push(`[${n}:a]adelay=${ms}|${ms}[s${n}]`); labels.push(`[s${n}]`); n++; }
  for (const t of ticks) { sfxInputs.push('-i', tick); const ms = Math.round(t * 1000); pre.push(`[${n}:a]adelay=${ms}|${ms}[s${n}]`); labels.push(`[s${n}]`); n++; }
  const sfxTrack = path.join(dir, 'sfx.wav');
  const filter = `${pre.join(';')}${pre.length ? ';' : ''}${labels.join('')}amix=inputs=${labels.length}:normalize=0`;
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono:d=${duration.toFixed(2)}`,
    ...sfxInputs, '-filter_complex', filter, '-t', duration.toFixed(2), sfxTrack], { maxBuffer: 1024 * 1024 * 8 });
  log(`SFX: ${cuts.length} whoosh + ${ticks.length} tick`);

  // ميكس + loudnorm -14 LUFS
  const mixed = path.join(dir, 'audio.wav');
  await run('ffmpeg', ['-y', '-i', voicePath, '-i', sfxTrack,
    '-filter_complex', '[0:a]apad[v];[v][1:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11',
    '-t', duration.toFixed(2), mixed], { maxBuffer: 1024 * 1024 * 8 });
  return mixed;
}
