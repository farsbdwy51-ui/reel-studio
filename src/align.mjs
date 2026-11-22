// محاذاة كلمات التوقيت على توكنز السكريبت نفسه بـ LCS على مستوى الحرف
// كده الكابشن يستخدم إملاء السكريبت، وياخد الوقت من الصوت

function normalize(s) {
  return s
    .replace(/[ً-ْٰـ]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[؟?!.,،:؛«»"'\-()]/g, '')
    .toLowerCase();
}

// LCS char-level بين سلسلتين؛ يرجع أزواج (i في a, j في b) المتطابقة
export function lcsMatchPairs(a, b) {
  const n = a.length, m = b.length;
  // DP مع Hirschberg مش ضروري هنا — النصوص قصيرة (<2000 حرف)
  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) i++;
    else j++;
  }
  return pairs;
}

// timedWords: [{word, start, end}] — من TTS أو Deepgram
// scriptTokens: [string] — توكنز السكريبت الأصلية
// يرجع [{word: token, start, end, weak}] بنفس ترتيب وإملاء السكريبت
export function alignTokens(timedWords, scriptTokens) {
  const timedNorm = timedWords.map((w) => normalize(w.word));
  const tokenNorm = scriptTokens.map((t) => normalize(t));
  const a = timedNorm.join('�'); // فاصل مش موجود في النص
  const b = tokenNorm.join('�');
  const pairs = lcsMatchPairs(a, b);

  // فهارس بداية كل كلمة داخل السلاسل المجمّعة
  const wordStartA = [];
  { let p = 0; for (const w of timedNorm) { wordStartA.push(p); p += w.length + 1; } }
  const wordStartB = [];
  { let p = 0; for (const w of tokenNorm) { wordStartB.push(p); p += w.length + 1; } }

  // لكل توكن: الحروف المتطابقة ومواقعها في A
  const matchedByToken = tokenNorm.map(() => []);
  for (const [ia, jb] of pairs) {
    // أي توكن يحتوي jb؟
    const tokIdx = findWord(wordStartB, tokenNorm, jb);
    if (tokIdx >= 0) matchedByToken[tokIdx].push(ia);
  }

  // حوّل مواقع الحروف في A لأوقات (بتقريب خطي داخل الكلمة)
  const timeOfA = (ia) => {
    const wi = findWord(wordStartA, timedNorm, ia);
    if (wi < 0) return null;
    const w = timedWords[wi];
    const off = ia - wordStartA[wi];
    const len = Math.max(1, timedNorm[wi].length);
    return { t: w.start + (off / len) * (w.end - w.start), wi };
  };

  const out = scriptTokens.map((token, k) => {
    const matched = matchedByToken[k];
    const ratio = tokenNorm[k].length ? matched.length / tokenNorm[k].length : 0;
    let start = null, end = null;
    if (matched.length) {
      const times = matched.map(timeOfA).filter(Boolean);
      start = Math.min(...times.map((x) => x.t));
      end = Math.max(...times.map((x) => x.t));
    }
    return { word: token, start, end, weak: ratio < 0.6, matchRatio: ratio };
  });

  // كمّل الفجوات بالاستيفاء بين الجيران
  for (let k = 0; k < out.length; k++) {
    if (out[k].start !== null) continue;
    const prev = out.slice(0, k).reverse().find((x) => x.end !== null);
    const next = out.slice(k + 1).find((x) => x.start !== null);
    const s = prev ? prev.end : (next ? Math.max(0, next.start - 0.15) : 0);
    const e = next ? next.start : (prev ? prev.end + 0.15 : s + 0.15);
    out[k].start = s;
    out[k].end = Math.max(e, s + 0.08);
    out[k].weak = true;
  }
  return out;
}

function findWord(starts, words, pos) {
  // أعلى كلمة بدايتها <= pos
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
