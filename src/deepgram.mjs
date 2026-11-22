// Deepgram: توقيت الكلمات لملف صوت مرفوع (nova-3, عربي, punctuate)
export async function transcribeWords({ baseUrl, apiKey, audio, contentType = 'audio/wav', signal }) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/listen?model=nova-3&language=ar&punctuate=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Token ${apiKey || ''}`,
      'content-type': contentType,
    },
    body: audio,
    signal,
  });
  if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const words = j.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  return words.map((w) => ({ word: w.punctuated_word || w.word, start: w.start, end: w.end }));
}
