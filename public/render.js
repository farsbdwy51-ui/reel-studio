// Reel Studio — محرك رسم الفريمات. كل حاجة دالة في t بس (deterministic).
(function () {
  const P = {
    bg: '#0C1014', card: '#161C22', elevated: '#202830',
    text: '#F4F3EE', secondary: '#9AA5AE',
    accent: '#27B8C7', accent2: '#5978FF',
    success: '#36C98F', warn: '#F28A30',
  };
  const W = 720, H = 1280;
  const CARD = { x: 36, y: 128, w: 648, h: 740, r: 28 };
  const CX = CARD.x + CARD.w / 2, CY = CARD.y + CARD.h / 2;

  let DATA = null;
  let canvas, ctx;

  window.initRender = function (data) {
    DATA = data;
    canvas = document.getElementById('c');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    DATA.chunks = chunkTokens(DATA.tokens);
    for (const s of DATA.scenes) {
      if (!s.iconId && s.icon && DATA.icons) {
        const hit = Object.values(DATA.icons).find((ic) => ic.name === s.icon || (ic.aliases || []).includes(s.icon));
        s.iconId = hit ? hit.id : null;
      }
    }
  };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function chunkTokens(tokens) {
    const chunks = []; let cur = [];
    for (let i = 0; i < tokens.length; i++) {
      cur.push(i);
      if (cur.length >= 4 || /[.!؟?,،:؛]$/.test(tokens[i].word)) { chunks.push(cur); cur = []; }
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(244,243,238,0.035)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function drawCard() {
    roundRect(CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.strokeStyle = 'rgba(39,184,199,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function clipCard() {
    roundRect(CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
    ctx.clip();
  }

  function drawHeader(t) {
    // بادج السلسلة على اليمين
    ctx.font = '500 26px ReelFont';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    const tag = '«' + DATA.seriesTag + '»';
    const tw = ctx.measureText(tag).width;
    const px = W - 46 - tw / 2 - 20, py = 62;
    ctx.fillStyle = 'rgba(39,184,199,0.12)';
    roundRect(px - tw / 2 - 20, py - 22, tw + 40, 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(39,184,199,0.45)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = P.accent;
    ctx.fillText(tag, px, py + 1);
    // العنوان على الشمال
    ctx.font = '400 24px ReelFont';
    ctx.textAlign = 'left'; ctx.direction = 'rtl';
    ctx.fillStyle = P.secondary;
    const title = DATA.title || '';
    const short = title.length > 30 ? title.slice(0, 30) + '…' : title;
    ctx.fillText(short, 46, py + 1);
  }

  function drawProgress(t) {
    const x0 = 660, x1 = 60, y = H - 34; // RTL: يمتلئ من اليمين
    ctx.fillStyle = P.elevated;
    roundRect(x1, y - 4, x0 - x1, 8, 4); ctx.fill();
    const p = clamp(t / DATA.duration);
    const wpx = (x0 - x1) * p;
    if (wpx > 1) {
      ctx.fillStyle = P.accent;
      roundRect(x0 - wpx, y - 4, wpx, 8, 4); ctx.fill();
    }
  }

  function drawCaptions(t) {
    const { tokens, chunks } = DATA;
    let ai = -1;
    for (let i = 0; i < tokens.length; i++) if (tokens[i].start <= t + 0.02) ai = i;
    if (ai < 0) return;
    const chunk = chunks.find((c) => c.includes(ai));
    if (!chunk) return;
    const words = chunk.map((i) => ({ i, ...tokens[i] }));
    const fs = 42;
    ctx.font = `500 ${fs}px ReelFont`;
    ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.textAlign = 'center';
    const gap = 20;
    const widths = words.map((w) => ctx.measureText(w.word).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
    const fit = Math.min(1, 650 / total);
    const y = 1000;
    let x = W / 2 + (total * fit) / 2; // أقصى يمين السطر
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      const ww = widths[k] * fit;
      const cxw = x - ww / 2;
      const active = w.i === ai;
      const spoken = w.i <= ai;
      ctx.save();
      if (active) {
        const pulse = 1 + 0.1 * Math.sin(clamp((t - w.start) / 0.3) * Math.PI);
        ctx.translate(cxw, y); ctx.scale(pulse, pulse); ctx.translate(-cxw, -y);
        ctx.shadowColor = 'rgba(39,184,199,0.6)'; ctx.shadowBlur = 22;
      }
      ctx.fillStyle = active ? P.accent : spoken ? P.text : 'rgba(154,165,174,0.5)';
      if (w.tone === 'accent' && spoken && !active) ctx.fillStyle = P.accent2;
      ctx.fillText(w.word, cxw, y);
      ctx.restore();
      if (w.tone === 'underline' && spoken) {
        const p = easeOutCubic(clamp((t - w.start) / 0.3));
        ctx.strokeStyle = P.accent; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y + 36); ctx.lineTo(x - ww * p, y + 36); ctx.stroke();
      }
      x -= ww + gap * fit;
    }
  }

  function iconById(id) { return id && DATA.icons ? DATA.icons[id] : null; }

  function drawIcon(icon, x, y, size, color, progress = 1) {
    if (!icon) return;
    const vb = icon.viewBox || 24;
    const s = easeOutBack(clamp(progress));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((size / vb) * s, (size / vb) * s);
    ctx.translate(-vb / 2, -vb / 2);
    ctx.globalAlpha *= clamp(progress * 2);
    if (icon.style === 'fill') {
      ctx.fillStyle = color;
      for (const d of icon.paths || []) ctx.fill(new Path2D(d));
      for (const c of icon.circles || []) { ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, 7); ctx.fill(); }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const d of icon.paths || []) ctx.stroke(new Path2D(d));
      for (const c of icon.circles || []) { ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
  }

  // خط بيرسم نفسه من (x1,y1) لـ (x2,y2)
  function drawOnLine(x1, y1, x2, y2, p, color, width = 5) {
    if (p <= 0) return;
    const q = easeOutCubic(clamp(p));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, q), lerp(y1, y2, q)); ctx.stroke();
  }

  function drawArrowHead(x, y, angle, color, size = 16) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size, -size * 0.7); ctx.lineTo(0, 0); ctx.lineTo(-size, size * 0.7); ctx.stroke();
    ctx.restore();
  }

  function sceneLabel(scene, lt) {
    if (!scene.label) return;
    ctx.font = '500 30px ReelFont'; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    ctx.globalAlpha *= clamp(lt / 0.15);
    ctx.fillStyle = P.secondary;
    ctx.fillText(scene.label, CX, CARD.y + 52);
    ctx.globalAlpha /= clamp(lt / 0.15) || 1;
  }

  // ---------- التمبليتس ----------
  const T = {
    intro(scene, lt, t) {
      const p = easeOutBack(clamp((lt + 0.1) / 0.35));
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX, CY - 170, 110, P.accent, clamp((lt + 0.1) / 0.3));
      // حلقة توهج
      const rp = clamp(lt / 0.5);
      ctx.strokeStyle = `rgba(89,120,255,${0.5 * (1 - rp)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY - 170, 60 + rp * 130, 0, 7); ctx.stroke();
      // العنوان
      ctx.save();
      ctx.translate(CX, CY + 20); ctx.scale(p, p); ctx.translate(-CX, -(CY + 20));
      ctx.font = '700 64px ReelFont'; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.text;
      wrapText(DATA.title || '', CX, CY + 20, 560, 78);
      ctx.restore();
    },

    question(scene, lt, t) {
      for (let i = 0; i < 3; i++) {
        const rr = ((lt * 1.4 + i / 3) % 1) * 260;
        ctx.strokeStyle = `rgba(39,184,199,${0.45 * (1 - rr / 260)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(CX, CY - 30, 60 + rr, 0, 7); ctx.stroke();
      }
      const p = easeOutBack(clamp(lt / 0.3));
      ctx.save();
      ctx.translate(CX, CY - 40); ctx.scale(p, p); ctx.translate(-CX, -(CY - 40));
      ctx.font = '700 300px ReelFont'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.fillStyle = P.accent;
      ctx.shadowColor = 'rgba(39,184,199,0.5)'; ctx.shadowBlur = 40;
      ctx.fillText('؟', CX, CY - 30);
      ctx.restore();
    },

    body(scene, lt, t) {
      const p = easeOutCubic(clamp(lt / 0.4));
      ctx.strokeStyle = P.secondary; ctx.lineWidth = 4; ctx.globalAlpha *= 0.85;
      // راس
      ctx.beginPath(); ctx.arc(CX, CY - 190, 52 * p, 0, 7); ctx.stroke();
      // جسم
      ctx.beginPath();
      ctx.moveTo(CX, CY - 138);
      ctx.bezierCurveTo(CX - 90 * p, CY - 120, CX - 95 * p, CY + 30, CX - 55 * p, CY + 150);
      ctx.moveTo(CX, CY - 138);
      ctx.bezierCurveTo(CX + 90 * p, CY - 120, CX + 95 * p, CY + 30, CX + 55 * p, CY + 150);
      ctx.stroke();
      // رجلين
      drawOnLine(CX - 45 * p, CY + 148, CX - 50 * p, CY + 250, p, P.secondary, 4);
      drawOnLine(CX + 45 * p, CY + 148, CX + 50 * p, CY + 250, p, P.secondary, 4);
      ctx.globalAlpha /= 0.85 || 1;
      // العضو جوه الجسم
      const icon = iconById(scene.iconId);
      const pulse = 1 + 0.06 * Math.sin(t * 5);
      if (icon) drawIcon(icon, CX, CY - 10, 120 * pulse, P.accent, clamp((lt - 0.25) / 0.3));
      ctx.strokeStyle = 'rgba(39,184,199,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, CY - 10, 95 + 6 * Math.sin(t * 5), 0, 7); ctx.stroke();
    },

    zoom(scene, lt, t) {
      // من ماكرو لميكرو: حلقات متحدة المركز بتتقرب + نقطة بتنزل لجوه
      for (let i = 5; i >= 1; i--) {
        const r = i * 62;
        const appear = clamp((lt - (5 - i) * 0.1) / 0.35);
        if (appear <= 0) continue;
        ctx.strokeStyle = `rgba(89,120,255,${0.15 + 0.5 * appear * (i <= 2 ? 1 : 0.5)})`;
        ctx.lineWidth = i <= 2 ? 4 : 2;
        ctx.beginPath();
        ctx.arc(CX, CY - 20, r, -Math.PI / 2, -Math.PI / 2 + appear * Math.PI * 2);
        ctx.stroke();
      }
      const dotA = -Math.PI / 2 + lt * Math.PI * 4;
      const dotR = lerp(300, 40, easeInOut(lt));
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(CX + dotR * Math.cos(dotA), CY - 20 + dotR * Math.sin(dotA), 12, 0, 7); ctx.fill();
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX, CY - 20, 90, P.text, clamp((lt - 0.55) / 0.3));
    },

    flow(scene, lt, t) {
      const labels = scene.labels || ['أ', 'ب', 'ج'];
      const ys = [CY - 220, CY - 30, CY + 160];
      for (let i = 0; i < 3; i++) {
        const p = clamp((lt - i * 0.18) / 0.25);
        if (p <= 0) continue;
        const s = easeOutBack(p);
        ctx.save();
        ctx.translate(CX, ys[i]); ctx.scale(s, s); ctx.translate(-CX, -ys[i]);
        ctx.fillStyle = P.elevated;
        roundRect(CX - 190, ys[i] - 52, 380, 104, 20); ctx.fill();
        ctx.strokeStyle = 'rgba(39,184,199,0.4)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '500 34px ReelFont'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillStyle = P.text;
        ctx.fillText(labels[i] || '', CX, ys[i]);
        ctx.restore();
        if (i < 2) {
          const ap = clamp((lt - (i * 0.18 + 0.18)) / 0.2);
          drawOnLine(CX, ys[i] + 54, CX, ys[i + 1] - 56, ap, P.accent, 4);
          if (ap > 0.9) drawArrowHead(CX, ys[i + 1] - 52, Math.PI / 2, P.accent, 14);
        }
      }
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX + 250, CY - 30, 80, P.accent2, clamp((lt - 0.4) / 0.3));
    },

    cycle(scene, lt, t) {
      const R = 190;
      const sweep = easeInOut(clamp(lt / 0.8)) * Math.PI * 2;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(CX, CY - 20, R, -Math.PI / 2, -Math.PI / 2 + sweep); ctx.stroke();
      if (sweep > 0.3) {
        const a = -Math.PI / 2 + sweep;
        drawArrowHead(CX + R * Math.cos(a), CY - 20 + R * Math.sin(a), a + Math.PI / 2, P.accent, 18);
      }
      const icons = (scene.icons || [scene.icon, 'spark', 'star']).slice(0, 3);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const icon = iconById(iconIdByName(icons[i]));
        drawIcon(icon, CX + (R + 70) * Math.cos(a), CY - 20 + (R + 70) * Math.sin(a), 70, P.accent2, clamp((lt - 0.15 * i) / 0.3));
      }
      const center = iconById(scene.iconId);
      if (center) drawIcon(center, CX, CY - 20, 90, P.text, clamp(lt / 0.4));
    },

    timeline(scene, lt, t) {
      const y = CY - 10;
      drawOnLine(CX + 240, y, CX - 240, y, clamp(lt / 0.5), P.secondary, 4); // RTL: من اليمين للشمال
      const marks = [0, 0.33, 0.66, 1];
      for (let i = 0; i < marks.length; i++) {
        const mx = CX + 240 - marks[i] * 480;
        const p = clamp((lt - marks[i] * 0.5 - 0.05) / 0.15);
        if (p <= 0) continue;
        const s = easeOutBack(p);
        ctx.save(); ctx.translate(mx, y); ctx.scale(s, s); ctx.translate(-mx, -y);
        ctx.fillStyle = i === marks.length - 1 ? P.accent : P.elevated;
        ctx.beginPath(); ctx.arc(mx, y, 16, 0, 7); ctx.fill();
        ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      }
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX, CY - 160, 90, P.accent, clamp(lt / 0.3));
    },

    chart(scene, lt, t) {
      const base = CY + 180, top = CY - 220;
      drawOnLine(CX - 260, base, CX + 260, base, clamp(lt / 0.3), P.secondary, 4);
      drawOnLine(CX - 260, base, CX - 260, top, clamp(lt / 0.3), P.secondary, 4);
      const vals = [0.42, 0.68, 0.5, 0.92];
      const cols = [P.accent, P.accent2, P.accent, P.success];
      for (let i = 0; i < vals.length; i++) {
        const p = easeOutBack(clamp((lt - 0.2 - i * 0.13) / 0.35));
        if (p <= 0) continue;
        const bw = 84, gap = 40;
        const x = CX - 260 + 40 + i * (bw + gap);
        const h = (base - top - 40) * vals[i] * p;
        ctx.fillStyle = cols[i];
        roundRect(x, base - h, bw, h, 10); ctx.fill();
      }
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX + 190, top - 10, 70, P.accent, clamp(lt / 0.3));
    },

    layers(scene, lt, t) {
      const cols = ['rgba(39,184,199,0.25)', 'rgba(89,120,255,0.25)', 'rgba(54,201,143,0.25)'];
      const edge = [P.accent, P.accent2, P.success];
      for (let i = 0; i < 3; i++) {
        const p = clamp((lt - i * 0.16) / 0.3);
        if (p <= 0) continue;
        const slide = (1 - easeOutCubic(p)) * 160;
        const w = 440 - i * 70;
        const y = CY - 160 + i * 130;
        ctx.fillStyle = cols[i];
        roundRect(CX - w / 2 + slide, y, w, 104, 18); ctx.fill();
        ctx.strokeStyle = edge[i]; ctx.lineWidth = 2.5; ctx.stroke();
      }
      const icon = iconById(scene.iconId);
      if (icon) drawIcon(icon, CX, CY - 250, 70, P.text, clamp((lt - 0.5) / 0.3));
    },

    cards(scene, lt, t) {
      const size = 200, gap = 36;
      const off = (size + gap) / 2, my = CY - 30;
      const pos = [
        [CX + off, my - off],
        [CX - off, my - off],
        [CX + off, my + off],
        [CX - off, my + off],
      ];
      const icons = (scene.icons || [scene.icon, 'spark', 'star', 'bolt']).slice(0, 4);
      for (let i = 0; i < 4; i++) {
        const p = clamp((lt - i * 0.12) / 0.3);
        if (p <= 0) continue;
        const s = easeOutBack(p);
        const [cx, cy] = pos[i];
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        ctx.fillStyle = P.elevated;
        roundRect(cx - size / 2, cy - size / 2, size, size, 22); ctx.fill();
        ctx.strokeStyle = 'rgba(39,184,199,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        drawIcon(iconById(iconIdByName(icons[i])), cx, cy, 90, i % 2 ? P.accent2 : P.accent, p);
      }
    },

    meter(scene, lt, t) {
      const R = 210, y = CY + 20;
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      ctx.strokeStyle = P.elevated; ctx.lineWidth = 26; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(CX, y, R, a0, a1); ctx.stroke();
      const p = easeInOut(clamp(lt / 0.7));
      ctx.strokeStyle = P.accent;
      ctx.beginPath(); ctx.arc(CX, y, R, a0, a0 + (a1 - a0) * p); ctx.stroke();
      // الإبرة
      const na = a0 + (a1 - a0) * p;
      ctx.strokeStyle = P.text; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(CX, y);
      ctx.lineTo(CX + (R - 50) * Math.cos(na), y + (R - 50) * Math.sin(na)); ctx.stroke();
      ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(CX, y, 12, 0, 7); ctx.fill();
      ctx.font = '700 60px ReelFont'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.fillStyle = P.accent;
      ctx.fillText(Math.round(p * 100) + '٪', CX, y + 130);
    },
  };

  // alias نوع المشهد → تمبليت احتياطي
  const TYPE_FALLBACK = { intro: 'intro', question: 'question', concept: 'body', process: 'flow', compare: 'cards', stat: 'chart', recap: 'layers' };

  function iconIdByName(name) {
    if (!name || !DATA.icons) return null;
    const q = String(name).toLowerCase();
    const hit = Object.values(DATA.icons).find((ic) => ic.name.toLowerCase() === q || (ic.aliases || []).some((a) => a.toLowerCase() === q));
    return hit ? hit.id : null;
  }

  function wrapText(text, x, y, maxW, lineH) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    const y0 = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lineH));
  }

  function drawTemplate(scene, lt, t) {
    const tpl = T[scene.template] ? scene.template : (TYPE_FALLBACK[scene.type] || 'cards');
    T[tpl](scene, lt, t);
    sceneLabel(scene, lt);
  }

  window.drawFrame = function (t) {
    const { scenes } = DATA;
    let si = 0;
    for (let i = 0; i < scenes.length; i++) if (t >= scenes[i].start) si = i;
    const scene = scenes[si];
    const sEnd = si + 1 < scenes.length ? scenes[si + 1].start : DATA.duration;
    const sDur = Math.max(0.001, sEnd - scene.start);
    const lt = clamp((t - scene.start) / sDur);

    drawBackground();

    // كاميرا: push-in ناعم على الكارد
    ctx.save();
    const zoom = 1 + 0.04 * easeInOut(lt);
    ctx.translate(W / 2, CY); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -CY);
    drawCard();
    ctx.save();
    clipCard();
    // اللياءوت الجاية تظهر باهتة قبل كلمتها
    const next = scenes[si + 1];
    if (next && next.start > t && next.start - t < 0.45) {
      ctx.globalAlpha = 0.16;
      drawTemplate(next, 0, t);
      ctx.globalAlpha = 1;
    }
    drawTemplate(scene, lt, t);
    ctx.restore();
    ctx.restore();

    drawHeader(t);
    drawCaptions(t);
    drawProgress(t);
    return true;
  };
})();
