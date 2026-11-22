// عميل OpenAI-compatible مع ستريمينج SSE وتنضيف بلوكات <think>...</think>

// فلتر يشيل بلوكات think حتى لو التاج اتقسم على أكتر من chunk
export function createThinkStripper() {
  let mode = 'normal'; // normal | think
  let hold = '';
  const OPEN = '<think>';
  const CLOSE = '</think>';
  function strip(chunk) {
    let s = hold + chunk;
    hold = '';
    let out = '';
    while (s.length) {
      if (mode === 'normal') {
        const i = s.indexOf('<');
        if (i === -1) { out += s; s = ''; continue; }
        out += s.slice(0, i);
        s = s.slice(i);
        if (s.length < OPEN.length && OPEN.startsWith(s)) { hold = s; s = ''; continue; }
        if (s.startsWith(OPEN)) { mode = 'think'; s = s.slice(OPEN.length); continue; }
        out += s[0]; s = s.slice(1);
      } else {
        const i = s.indexOf(CLOSE);
        if (i !== -1) { mode = 'normal'; s = s.slice(i + CLOSE.length); continue; }
        // ممكن جزء من تاج القفلة يكون في آخر النص
        let holdLen = 0;
        for (let len = Math.min(CLOSE.length - 1, s.length); len > 0; len--) {
          if (CLOSE.startsWith(s.slice(s.length - len))) { holdLen = len; break; }
        }
        hold = s.slice(s.length - holdLen);
        s = '';
      }
    }
    return out;
  }
  strip.flush = () => { const rest = mode === 'normal' ? hold : ''; hold = ''; return rest; };
  return strip;
}

export async function* streamChat({ baseUrl, apiKey, model = 'auto', messages, signal, onToken }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const strip = createThinkStripper();
  const decoder = new TextDecoder();
  let buffer = '';
  let visible = '';

  const emit = (text) => {
    if (!text) return;
    visible += text;
    if (onToken) onToken(text, visible);
  };

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { emit(strip.flush()); return; }
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      const delta = json.choices?.[0]?.delta?.content ?? '';
      if (delta) { const out = strip(delta); if (out) { emit(out); yield out; } }
    }
  }
  const tail = strip.flush();
  if (tail) { emit(tail); yield tail; }
}

export async function chat(opts) {
  let text = '';
  for await (const tok of streamChat(opts)) text += tok;
  return text;
}
