import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULTS = {
  llmBaseUrl: 'http://127.0.0.1:31415/v1',
  llmModel: 'auto',
  elevenlabsBaseUrl: 'https://api.elevenlabs.io',
  elevenlabsKey: '',
  elevenlabsVoiceId: '',
  deepgramBaseUrl: 'https://api.deepgram.com',
  deepgramKey: '',
  fontFolder: '',
};

const ENV_MAP = {
  FREELLM_BASE_URL: 'llmBaseUrl',
  LLM_MODEL: 'llmModel',
  ELEVENLABS_BASE_URL: 'elevenlabsBaseUrl',
  ELEVENLABS_API_KEY: 'elevenlabsKey',
  ELEVENLABS_VOICE_ID: 'elevenlabsVoiceId',
  DEEPGRAM_BASE_URL: 'deepgramBaseUrl',
  DEEPGRAM_API_KEY: 'deepgramKey',
  FONT_FOLDER: 'fontFolder',
};

function readEnvFile() {
  const envPath = path.join(ROOT, '.env');
  const out = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
    }
  }
  for (const [envKey, settingKey] of Object.entries(ENV_MAP)) {
    const v = process.env[envKey] ?? out[envKey];
    if (v !== undefined && v !== '') out[envKey] = v;
  }
  return out;
}

export function loadSettings() {
  const fromEnv = readEnvFile();
  let fromFile = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try { fromFile = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { fromFile = {}; }
  }
  const merged = { ...DEFAULTS };
  // .env أولاً، وبعدين ملف الإعدادات (الأولوية للملف)
  for (const [envKey, settingKey] of Object.entries(ENV_MAP)) {
    if (fromEnv[envKey]) merged[settingKey] = fromEnv[envKey];
  }
  Object.assign(merged, fromFile);
  return merged;
}

export function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current };
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in patch)) continue;
    const v = String(patch[k] ?? '');
    // المتصفح بيشوف المفاتيح متقنّعة — لو رجعت متقنّعة منسيبش القديم
    if (v.includes('••••')) continue;
    next[k] = v;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

function mask(key) {
  if (!key) return '';
  return '••••' + key.slice(-4);
}

export function maskedSettings(s) {
  return {
    ...s,
    elevenlabsKey: mask(s.elevenlabsKey),
    deepgramKey: mask(s.deepgramKey),
    hasElevenlabsKey: Boolean(s.elevenlabsKey),
    hasDeepgramKey: Boolean(s.deepgramKey),
  };
}
