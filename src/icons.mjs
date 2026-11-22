import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIB_PATH = path.join(ROOT, 'assets', 'icons', 'icons.json');

let cache = null;
export function loadIconLib() {
  if (!cache) cache = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'));
  return cache;
}

// حلّل اسم أيقونة (اسم إنجليزي بسيط) لأيقونة من المكتبة المحلية
export function resolveIcon(noun, lib = loadIconLib()) {
  if (!noun) return null;
  const q = String(noun).trim().toLowerCase();
  for (const icon of lib.icons) {
    if (icon.name.toLowerCase() === q) return icon;
  }
  for (const icon of lib.icons) {
    if ((icon.aliases || []).some((a) => a.toLowerCase() === q)) return icon;
  }
  // مطابقة جزئية
  for (const icon of lib.icons) {
    if (icon.name.toLowerCase().includes(q) || (icon.aliases || []).some((a) => a.toLowerCase().includes(q))) return icon;
  }
  return null;
}

// اجمع الأيقونات المطلوبة في ستوري بورد وارجع بس اللي بيستخدمها المشروع
export function collectUsedIcons(scenes, lib = loadIconLib()) {
  const used = new Map();
  for (const scene of scenes || []) {
    const names = [scene.icon, ...(scene.icons || [])].filter(Boolean);
    for (const n of names) {
      const icon = resolveIcon(n, lib) || resolveIcon('spark', lib);
      if (icon) used.set(icon.id, icon);
    }
  }
  return Object.fromEntries(used);
}
