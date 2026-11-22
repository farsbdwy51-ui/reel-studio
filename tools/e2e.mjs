// e2e: يشغّل الـ mocks والسيرفر، يعمل مشروع، يوافق على السكريبت، ويستنى الريندر
import { startMockApis } from './mock-apis.mjs';

const MOCK = Number(process.env.MOCK_PORT || 4399);
const PORT = Number(process.env.PORT || 4301);
process.env.FREELLM_BASE_URL = `http://127.0.0.1:${MOCK}/v1`;
process.env.ELEVENLABS_BASE_URL = `http://127.0.0.1:${MOCK}`;
process.env.DEEPGRAM_BASE_URL = `http://127.0.0.1:${MOCK}`;
process.env.ELEVENLABS_API_KEY = 'mock-key';
process.env.DEEPGRAM_API_KEY = 'mock-key';

const { createServer } = await import('../server.mjs');
const { ffprobeDuration } = await import('../src/render.mjs');

const api = async (path, method = 'GET', body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await startMockApis(MOCK);
  const app = createServer();
  await new Promise((r) => app.listen(PORT, '127.0.0.1', r));
  console.log('السيرفر والـ mocks شغالين');

  // 1) مشروع بموافقة يدوية على السكريبت، والباقي تلقائي
  const topic = process.argv[2] || 'ليه السما زرقا؟';
  let proj = await api('/api/projects', 'POST', {
    topic, lengthSeconds: 10,
    approvals: { script: 'manual', voice: 'auto', timing: 'auto', storyboard: 'auto', render: 'auto' },
  });
  console.log('مشروع:', proj.id);

  // استنى مرحلة review
  for (let i = 0; i < 120; i++) {
    proj = await api(`/api/projects/${proj.id}`);
    if (proj.stages.script.status === 'review') break;
    if (proj.stages.script.status === 'error') throw new Error('script error: ' + proj.stages.script.log.join(' | '));
    await sleep(500);
  }
  if (proj.stages.script.status !== 'review') throw new Error('السكريبت ماوصلش لمرحلة المراجعة');
  console.log('السكريبت في المراجعة — عنوان:', proj.script.title);
  proj = await api(`/api/projects/${proj.id}/stages/script/approve`, 'POST');
  console.log('تمت الموافقة على السكريبت');

  // استنى الريندر
  const t0 = Date.now();
  while (Date.now() - t0 < 12 * 60 * 1000) {
    proj = await api(`/api/projects/${proj.id}`);
    if (proj.stages.render.status === 'done') break;
    for (const [s, st] of Object.entries(proj.stages)) {
      if (st.status === 'error') throw new Error(`المرحلة ${s} فشلت: ${st.log.slice(-3).join(' | ')}`);
    }
    await sleep(1000);
  }

  // 2) فحص كل مرحلة
  let fail = 0;
  for (const s of ['script', 'voice', 'timing', 'storyboard', 'render']) {
    const st = proj.stages[s].status;
    console.log(`${st === 'done' ? '✅' : '❌'} ${s}: ${st}`);
    if (st !== 'done') fail = 1;
  }
  if (!proj.hasVideo) { console.log('❌ مفيش فيديو'); process.exit(1); }

  const res = await fetch(`http://127.0.0.1:${PORT}/api/projects/${proj.id}/video`);
  const buf = Buffer.from(await res.arrayBuffer());
  const fs = await import('node:fs');
  const out = `out/reel-${proj.id}.mp4`;
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync(out, buf);
  const dur = await ffprobeDuration(out);
  console.log(`🎬 الفيديو: ${out} — ${buf.length} بايت — المدة: ${dur.toFixed(2)} ثانية`);
  const cs = await fetch(`http://127.0.0.1:${PORT}/api/projects/${proj.id}/contact-sheet`);
  fs.writeFileSync(`out/sheet-${proj.id}.png`, Buffer.from(await cs.arrayBuffer()));
  console.log(`🖼 contact sheet: out/sheet-${proj.id}.png`);

  app.close();
  process.exit(fail);
}

main().catch((e) => { console.error('❌ e2e فشل:', e.message); process.exit(1); });
