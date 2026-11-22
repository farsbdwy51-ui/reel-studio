// Mock APIs على :4399 — FreeLLMAPI + ElevenLabs + Deepgram مزيفين، كل الفلو يشتغل أوفلاين
import http from 'node:http';

export const MOCK_PORT = Number(process.env.MOCK_PORT || 4399);

// ---------- توليد سكريبت مصري ثابت ----------
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }

function mockScript(topic, seconds) {
  const words = Math.round(2.6 * seconds);
  const title = topic.endsWith('؟') ? topic : `ليه ${topic}؟`;
  const hook = 'تخيل إن كل حاجة حواليك ليها سر مخفي.';
  const q = 'عارف ليه؟';
  const analogy = `خد مثال بسيط: ${topic} زي لمبة الموبايل، بتشتغل بقاعدة واحدة واضحة.`;
  const explain1 = 'العلم بيقول إن السبب أبسط مما تفتكر بكتير.';
  const explain2 = 'كل جزء بيشتغل مع التاني زي تروس ساعة صغيرة.';
  const recap = 'الخلاصة: الفكرة كلها في خطوة واحدة، والباقي تفاصيل.';
  let lines = [hook, q, analogy, explain1, explain2, recap];
  // ظبط عدد الكلمات تقريباً على المدة
  const count = (ls) => ls.join(' ').split(/\s+/).length;
  while (count(lines) > words + 4 && lines.length > 4) lines.splice(lines.length - 2, 1);
  const script = lines.join('\n');
  return `TITLE: ${title}\nSCRIPT:\n${script}\nSOURCES:\nمعلومات علمية عامة (mock)`;
}

function mockStoryboard(nTokens, topic) {
  const at = (f) => Math.min(nTokens - 1, Math.round(f * (nTokens - 1)));
  const templates = ['zoom', 'meter', 'flow', 'chart', 'layers'];
  const types = ['intro', 'question', 'process', 'stat', 'recap'];
  const icons = ['spark', 'bulb', 'wave', 'atom', 'star'];
  const fracs = [0, 0.22, 0.45, 0.68, 0.86];
  const scenes = fracs.map((f, i) => ({
    type: types[i], template: templates[i], at: at(f), icon: icons[(hash(topic) + i) % icons.length],
    label: i === 2 ? 'الفكرة خطوة خطوة' : '',
  }));
  const accents = [[at(0.22), 'accent'], [at(0.5), 'underline'], [at(0.86), 'accent']];
  return JSON.stringify({ scenes, accents });
}

function mockSelfReview(board, nTokens) {
  // تحسين ثابت: نوّع التمبليتس وزوّد accent
  try {
    const b = JSON.parse(board);
    const alts = ['cards', 'cycle', 'timeline', 'body', 'flow'];
    b.scenes = b.scenes.map((s, i) => ({
      ...s,
      template: i > 0 && b.scenes[i - 1] && s.template === b.scenes[i - 1].template ? alts[i % alts.length] : s.template,
    }));
    b.accents = [...(b.accents || []), [Math.min(nTokens - 1, 2), 'underline']];
    return JSON.stringify(b);
  } catch { return board; }
}

// ---------- WAV صنايعي: نغمة لكل كلمة ----------
function synthWav(words) {
  const sr = 22050;
  const gap = 0.07;
  const segments = [];
  for (const w of words) {
    const dur = Math.min(0.5, 0.11 + w.length * 0.022);
    segments.push({ dur, gap, f0: 160 + (hash(w) % 200) });
  }
  const totalDur = segments.reduce((a, s) => a + s.dur + s.gap, 0.15);
  const n = Math.ceil(totalDur * sr);
  const pcm = new Int16Array(n);
  let pos = Math.floor(0.08 * sr);
  const chars = [];
  for (const s of segments) {
    const w = segments.indexOf(s);
    const word = words[w];
    const wordStart = pos / sr;
    const wordSamples = Math.floor(s.dur * sr);
    for (let i = 0; i < wordSamples; i++) {
      const tt = i / sr;
      const env = Math.sin(Math.PI * i / wordSamples);
      pcm[pos + i] = Math.floor(12000 * env * (Math.sin(2 * Math.PI * s.f0 * tt) + 0.4 * Math.sin(2 * Math.PI * s.f0 * 1.5 * tt)));
    }
    // توقيت لكل حرف بالتساوي داخل الكلمة
    const cs = [...word];
    for (let i = 0; i < cs.length; i++) {
      chars.push({ c: cs[i], start: wordStart + (i / cs.length) * s.dur, end: wordStart + ((i + 1) / cs.length) * s.dur });
    }
    chars.push({ c: ' ', start: wordStart + s.dur, end: wordStart + s.dur });
    pos += wordSamples + Math.floor(s.gap * sr);
  }
  // WAV header
  const buf = Buffer.alloc(44 + pcm.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + pcm.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(pcm.length * 2, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  return { wav: buf, chars, duration: totalDur };
}

function sseChat(res, fullText) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const parts = fullText.split(/(\s+)/).filter((x) => x.length);
  let i = 0;
  const tick = () => {
    if (i >= parts.length) {
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    const chunk = { choices: [{ delta: { content: parts[i] } }] };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    i++;
    setTimeout(tick, 8);
  };
  tick();
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

let lastTtsWords = [];

export function startMockApis(port = MOCK_PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    try {
      // ---- FreeLLMAPI / OpenAI-compatible ----
      if (p === '/v1/chat/completions' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const sys = (body.messages || []).map((m) => m.content).join('\n');
        const user = (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
        let text;
        if (/SELF-REVIEW MODE/.test(sys)) {
          const boardM = user.match(/\{[\s\S]*\}/);
          const nM = user.match(/عدد الكلمات: (\d+)/);
          text = mockSelfReview(boardM ? boardM[0] : '{}', nM ? Number(nM[1]) : 30);
        } else if (/STORYBOARD MODE/.test(sys)) {
          const nM = user.match(/متقسم لـ (\d+) كلمة/);
          const topicM = user.match(/العنوان: (.+)/);
          text = mockStoryboard(nM ? Number(nM[1]) : 26, topicM ? topicM[1] : 'موضوع');
        } else {
          const topicM = user.match(/الموضوع: (.+)/);
          const lenM = user.match(/مدة الفيديو: (\d+)/);
          text = mockScript(topicM ? topicM[1].trim() : 'العلم', lenM ? Number(lenM[1]) : 10);
        }
        if (body.stream) return sseChat(res, text);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
      }

      // ---- ElevenLabs ----
      if (p === '/v1/voices' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ voices: [
          { voice_id: 'eg-ahmed', name: 'أحمد (مصري — mock)' },
          { voice_id: 'eg-salma', name: 'سلمى (مصري — mock)' },
        ] }));
      }
      const ttsM = p.match(/^\/v1\/text-to-speech\/([^/]+)\/with-timestamps$/);
      if (ttsM && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const words = String(body.text || '').split(/\s+/).filter(Boolean);
        const { wav, chars } = synthWav(words);
        lastTtsWords = words;
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          audio_base64: wav.toString('base64'),
          alignment: {
            characters: chars.map((c) => c.c),
            character_start_times_seconds: chars.map((c) => c.start),
            character_end_times_seconds: chars.map((c) => c.end),
          },
        }));
      }

      // ---- Deepgram ----
      if (p === '/v1/listen' && req.method === 'POST') {
        await readBody(req);
        // mock: يرجع آخر نص اتولّد بالـ TTS (أوفلاين)
        const words = lastTtsWords.length ? lastTtsWords : ['صوت', 'مرفوع', 'للتجربة'];
        const { chars } = synthWav(words);
        const wds = [];
        let cur = null;
        for (const c of chars) {
          if (c.c === ' ') { if (cur) { wds.push(cur); cur = null; } continue; }
          if (!cur) cur = { word: '', punctuated_word: '', start: c.start, end: c.end, confidence: 0.99 };
          cur.word += c.c; cur.punctuated_word += c.c; cur.end = c.end;
        }
        if (cur) wds.push(cur);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ results: { channels: [{ alternatives: [{ words: wds }] }] } }));
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'mock: not found', path: p }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`Mock APIs شغالة على http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockApis();
}
