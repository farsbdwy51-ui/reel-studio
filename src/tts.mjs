// ElevenLabs: تحويل النص لصوت مع توقيتات لكل حرف
export async function synthesize({ baseUrl, apiKey, voiceId, text, signal }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey || '',
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    signal,
  });
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const alignment = j.alignment || j.normalized_alignment;
  if (!alignment) throw new Error('ElevenLabs رد بدون alignment');
  return {
    audio: Buffer.from(j.audio_base64, 'base64'),
    audioExt: guessExt(j.audio_base64),
    alignment,
    words: charsToWords(alignment),
  };
}

function guessExt(b64) {
  // WAV بيبدأ بـ RIFF، MP3 بـ //u أو ID3
  if (b64.startsWith('UklGR')) return '.wav';
  return '.mp3';
}

// نحوّل توقيتات الحروف لكلمات
export function charsToWords(alignment) {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const words = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === ' ' || c === '\n' || c === '\t') {
      if (cur) { words.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { word: '', start: starts[i] ?? 0, end: ends[i] ?? 0 };
    cur.word += c;
    cur.end = ends[i] ?? cur.end;
  }
  if (cur) words.push(cur);
  return words;
}

export async function listVoices({ baseUrl, apiKey, signal }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/voices`, {
    headers: { 'xi-api-key': apiKey || '' },
    signal,
  });
  if (!res.ok) throw new Error(`ElevenLabs voices error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name }));
}
