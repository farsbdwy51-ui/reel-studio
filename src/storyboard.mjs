import { SCENE_TYPES, TEMPLATES } from './prompts.mjs';

// طلّع JSON من رد الموديل حتى لو لابس code fence
export function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('مفيش JSON في رد الموديل');
  return JSON.parse(raw.slice(start, end + 1));
}

// Validate + repair: أرقام صحيحة، مرتبة، أول scene intro عند 0، وممنوع نفس التمبليت 3 مرات ورا بعض
export function validateRepair(board, nTokens) {
  const scenes = [];
  const seen = new Set();
  for (const s of board.scenes || []) {
    let at = Number(s.at);
    if (!Number.isFinite(at)) continue;
    at = Math.max(0, Math.min(nTokens - 1, Math.round(at)));
    if (seen.has(at)) continue;
    seen.add(at);
    let type = SCENE_TYPES.includes(s.type) ? s.type : 'concept';
    let template = TEMPLATES.includes(s.template) ? s.template : defaultTemplate(type);
    scenes.push({ type, template, at, icon: s.icon || null, label: s.label || '', icons: s.icons || undefined });
  }
  scenes.sort((a, b) => a.at - b.at);
  if (!scenes.length || scenes[0].at !== 0 || scenes[0].type !== 'intro') {
    scenes.unshift({ type: 'intro', template: 'zoom', at: 0, icon: 'spark', label: '' });
  }
  // ممنوع 3 ورا بعض
  for (let i = 2; i < scenes.length; i++) {
    if (scenes[i].template === scenes[i - 1].template && scenes[i].template === scenes[i - 2].template) {
      const alt = TEMPLATES.find((t) => t !== scenes[i].template && t !== scenes[i - 1].template);
      scenes[i].template = alt;
    }
  }
  const accents = [];
  for (const a of board.accents || []) {
    const idx = Array.isArray(a) ? a[0] : a?.index;
    const tone = Array.isArray(a) ? a[1] : a?.tone;
    const i = Number(idx);
    if (Number.isFinite(i) && i >= 0 && i < nTokens) {
      accents.push([Math.round(i), tone === 'underline' ? 'underline' : 'accent']);
    }
  }
  accents.sort((a, b) => a[0] - b[0]);
  return { scenes, accents };
}

function defaultTemplate(type) {
  return {
    intro: 'zoom', question: 'meter', concept: 'body', process: 'flow',
    compare: 'cards', stat: 'chart', recap: 'layers',
  }[type] || 'cards';
}
