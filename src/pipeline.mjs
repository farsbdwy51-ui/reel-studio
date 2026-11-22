import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from './settings.mjs';
import * as llm from './llm.mjs';
import * as tts from './tts.mjs';
import * as deepgram from './deepgram.mjs';
import { alignTokens } from './align.mjs';
import { scriptMessages, storyboardMessages, selfReviewMessages } from './prompts.mjs';
import { extractJson, validateRepair } from './storyboard.mjs';
import { collectUsedIcons } from './icons.mjs';
import { renderVideo } from './render.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STYLE_GUIDE_PATH = path.join(ROOT, 'references', 'script-style.md');

export const STAGES = ['script', 'voice', 'timing', 'storyboard', 'render'];

export class Project {
  constructor({ root, topic, lengthSeconds, approvals }) {
    this.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.dir = path.join(root, this.id);
    fs.mkdirSync(this.dir, { recursive: true });
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);
    this.state = {
      id: this.id,
      topic,
      lengthSeconds: Number(lengthSeconds) || 10,
      createdAt: new Date().toISOString(),
      approvals: {
        script: approvals?.script || 'auto',
        voice: approvals?.voice || 'auto',
        timing: approvals?.timing || 'auto',
        storyboard: approvals?.storyboard || 'auto',
        render: approvals?.render || 'auto',
      },
      stages: Object.fromEntries(STAGES.map((s) => [s, { status: 'idle', log: [] }])),
      script: null,      // {title, script, sources, tokens}
      voice: null,       // {file, voiceId, uploaded}
      timing: null,      // {tokens:[{word,start,end,weak}], duration}
      storyboard: null,  // {scenes, accents}
      render: null,      // {video, contactSheet}
      useUploadedAudio: false,
    };
    this._running = false;
    this._currentStage = null;
    this._gate = null;
    this.abort = null;
    this._save();
  }

  public() {
    return {
      ...this.state,
      hasVideo: Boolean(this.state.render?.video && fs.existsSync(path.join(this.dir, this.state.render.video))),
      running: this._running,
      currentStage: this._currentStage,
    };
  }

  log(stage, msg) {
    const entry = this.state.stages[stage];
    entry.log.push(`[${new Date().toLocaleTimeString('en-GB')}] ${msg}`);
    if (entry.log.length > 300) entry.log.splice(0, entry.log.length - 300);
    this.events.emit('event', { type: 'log', stage, msg });
  }

  setStatus(stage, status) {
    this.state.stages[stage].status = status;
    this._save();
    this._emitState();
  }

  _emitState() {
    this.events.emit('event', { type: 'state', state: this.public() });
  }

  _save() {
    fs.writeFileSync(path.join(this.dir, 'project.json'), JSON.stringify(this.state, null, 2));
  }

  start() {
    if (this._running) return;
    this._runFrom(0);
  }

  rerun(stage) {
    if (this._running) throw new Error('فيه تشغيل شغال — ارفض أو استنى');
    const idx = STAGES.indexOf(stage);
    if (idx === -1) throw new Error('مرحلة غير معروفة');
    for (let i = idx; i < STAGES.length; i++) this.state.stages[STAGES[i]].status = 'idle';
    this._emitState();
    this._runFrom(idx);
  }

  approve(stage) {
    if (this._gate && this._gate.stage === stage) {
      this._gate.res('approved');
      this._gate = null;
      return;
    }
    if (this.state.stages[stage].status === 'review') {
      this.setStatus(stage, 'done');
      return;
    }
    throw new Error('المرحلة مش مستنية موافقة');
  }

  cancel(stage) {
    if (this._gate && this._gate.stage === stage) {
      this._gate.res('cancelled');
      this._gate = null;
      return;
    }
    if (this._currentStage === stage && this.abort) this.abort.abort();
  }

  editScript(text) {
    if (!this.state.script) throw new Error('مفيش سكريبت لسه');
    const parsed = parseScriptText(text);
    this.state.script = { ...this.state.script, ...parsed };
    this._save();
    this._emitState();
  }

  editStoryboard(board) {
    const n = this.state.timing?.tokens?.length || this.state.script?.tokens?.length || 1;
    this.state.storyboard = validateRepair(board, n);
    this._save();
    this._emitState();
  }

  setUploadedAudio(buf, filename = 'voice.wav') {
    const ext = path.extname(filename) || '.wav';
    fs.writeFileSync(path.join(this.dir, 'uploaded' + ext), buf);
    this.state.useUploadedAudio = true;
    this.state.uploadedFile = 'uploaded' + ext;
    this._save();
    this._emitState();
  }

  async _runFrom(startIdx) {
    this._running = true;
    this.abort = new AbortController();
    const { signal } = this.abort;
    try {
      for (let i = startIdx; i < STAGES.length; i++) {
        if (signal.aborted) throw new Error('aborted');
        const stage = STAGES[i];
        this._currentStage = stage;
        this.setStatus(stage, 'running');
        this.log(stage, 'بدأت المرحلة');
        await this._stageFns()[stage].call(this, signal);
        if (this.state.approvals[stage] === 'manual') {
          this.setStatus(stage, 'review');
          this.log(stage, 'مستنية موافقتك');
          const outcome = await new Promise((res) => { this._gate = { stage, res }; });
          this._gate = null;
          if (outcome === 'cancelled') { this.setStatus(stage, 'idle'); break; }
        }
        this.setStatus(stage, 'done');
        this.log(stage, 'خلصت');
      }
    } catch (e) {
      const aborted = signal.aborted || e.name === 'AbortError' || /abort/i.test(e.message || '');
      if (this._currentStage) {
        this.log(this._currentStage, aborted ? 'اتلغت' : `خطأ: ${e.message}`);
        this.setStatus(this._currentStage, aborted ? 'idle' : 'error');
      }
    } finally {
      this._running = false;
      this._currentStage = null;
      this._gate = null;
      this._save();
      this._emitState();
    }
  }

  _stageFns() {
    return {
      async script(signal) {
        const settings = loadSettings();
        const styleGuide = fs.readFileSync(STYLE_GUIDE_PATH, 'utf8');
        this.log('script', `بيكتب السكريبت عن: ${this.state.topic}`);
        const text = await llm.chat({
          baseUrl: settings.llmBaseUrl,
          apiKey: '',
          model: settings.llmModel || 'auto',
          messages: scriptMessages({ topic: this.state.topic, lengthSeconds: this.state.lengthSeconds, styleGuide }),
          signal,
          onToken: (tok, visible) => this.events.emit('event', { type: 'llm', stage: 'script', token: tok, text: visible }),
        });
        const parsed = parseScriptText(text);
        if (!parsed.tokens.length) throw new Error('الموديل مرجعش سكريبت صالح');
        this.state.script = parsed;
        this.log('script', `العنوان: ${parsed.title} — ${parsed.tokens.length} كلمة`);
        this._save();
      },

      async voice(signal) {
        const settings = loadSettings();
        const scriptText = this.state.script.script;
        if (this.state.useUploadedAudio && this.state.uploadedFile) {
          const file = path.join(this.dir, this.state.uploadedFile);
          this.log('voice', 'بيستخرج توقيت الكلمات من الصوت المرفوع (Deepgram)');
          const audio = fs.readFileSync(file);
          const words = await deepgram.transcribeWords({
            baseUrl: settings.deepgramBaseUrl, apiKey: settings.deepgramKey,
            audio, contentType: file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav', signal,
          });
          if (!words.length) throw new Error('Deepgram مرجعش كلمات');
          this.state.voice = { file: this.state.uploadedFile, uploaded: true, timedWords: words };
        } else {
          const voiceId = settings.elevenlabsVoiceId || 'eg-ahmed';
          this.log('voice', `بيولّد الصوت بصوت ${voiceId} (ElevenLabs)`);
          const { audio, audioExt, words } = await tts.synthesize({
            baseUrl: settings.elevenlabsBaseUrl, apiKey: settings.elevenlabsKey,
            voiceId, text: scriptText, signal,
          });
          const fname = 'voice' + audioExt;
          fs.writeFileSync(path.join(this.dir, fname), audio);
          this.state.voice = { file: fname, voiceId, uploaded: false, timedWords: words };
        }
        this.log('voice', `${this.state.voice.timedWords.length} كلمة متوقتة`);
        this._save();
      },

      async timing() {
        const tokens = this.state.script.tokens;
        const timedWords = this.state.voice.timedWords;
        this.log('timing', 'بتحاذى الكلمات على السكريبت (LCS على مستوى الحرف)');
        const aligned = alignTokens(timedWords, tokens);
        const weak = aligned.filter((t) => t.weak);
        const audioEnd = Math.max(...aligned.map((t) => t.end)) + 0.35;
        // لو الصوت أقصر من المدة المطلوبة، كمّل لحدها (آخر مشهد بيثبت)
        const duration = audioEnd < this.state.lengthSeconds ? this.state.lengthSeconds : audioEnd;
        this.state.timing = { tokens: aligned, duration };
        if (weak.length) this.log('timing', `كلمات ضعيفة المحاذاة: ${weak.map((w) => w.word).join('، ')}`);
        this._save();
      },

      async storyboard(signal) {
        const settings = loadSettings();
        const { title, tokens } = this.state.script;
        this.log('storyboard', 'بيبني الستوري بورد');
        const raw1 = await llm.chat({
          baseUrl: settings.llmBaseUrl, apiKey: '', model: settings.llmModel || 'auto',
          messages: storyboardMessages({ title, tokens, scriptText: this.state.script.script }),
          signal,
          onToken: (tok, visible) => this.events.emit('event', { type: 'llm', stage: 'storyboard', token: tok, text: visible }),
        });
        let board = validateRepair(extractJson(raw1), tokens.length);
        this.log('storyboard', `المراجعة الذاتية (${board.scenes.length} scenes)`);
        try {
          const raw2 = await llm.chat({
            baseUrl: settings.llmBaseUrl, apiKey: '', model: settings.llmModel || 'auto',
            messages: selfReviewMessages({ storyboard: board, tokens }),
            signal,
          });
          const reviewed = validateRepair(extractJson(raw2), tokens.length);
          if (reviewed.scenes.length >= 2) board = reviewed;
        } catch (e) {
          this.log('storyboard', 'المراجعة الذاتية فشلت — بيكمل بالنسخة الأولى');
        }
        // أوقات المشاهد من التوقيت
        const aligned = this.state.timing.tokens;
        const duration = this.state.timing.duration;
        board.scenes.forEach((s, i) => {
          s.start = aligned[s.at]?.start ?? 0;
          s.end = board.scenes[i + 1] ? (aligned[board.scenes[i + 1].at]?.start ?? duration) : duration;
        });
        this.state.storyboard = board;
        this.log('storyboard', board.scenes.map((s) => `${s.type}/${s.template}@${s.at}`).join(' | '));
        this._save();
      },

      async render(signal) {
        const settings = loadSettings();
        const timing = this.state.timing;
        const board = this.state.storyboard;
        const accents = new Map(board.accents || []);
        const tokens = timing.tokens.map((t, i) => ({ ...t, tone: accents.get(i) || null }));
        const icons = collectUsedIcons(board.scenes);
        const voicePath = path.join(this.dir, this.state.voice.file);
        const payload = {
          width: 720, height: 1280, fps: 30,
          duration: timing.duration,
          title: this.state.script.title,
          seriesTag: 'عارف ليه؟',
          topic: this.state.topic,
          tokens, scenes: board.scenes, icons,
        };
        this.log('render', `بيتريندر ${Math.round(timing.duration * 30)} فريم (30fps)`);
        const out = await renderVideo({
          payload, voicePath, dir: this.dir, fontFolder: settings.fontFolder, signal,
          onProgress: (done, total) => this.events.emit('event', { type: 'progress', stage: 'render', done, total }),
          onPreview: (jpegB64) => this.events.emit('event', { type: 'preview', stage: 'render', jpeg: jpegB64 }),
          log: (m) => this.log('render', m),
        });
        this.state.render = { video: path.basename(out.video), contactSheet: path.basename(out.contactSheet), duration: timing.duration };
        this._save();
      },
    };
  }
}

// يفصل TITLE / SCRIPT / SOURCES
export function parseScriptText(text) {
  const titleM = text.match(/TITLE:\s*(.+)/);
  const scriptM = text.match(/SCRIPT:\s*([\s\S]*?)(?=\nSOURCES:|$)/);
  const sourcesM = text.match(/SOURCES:\s*([\s\S]*)$/);
  const script = (scriptM?.[1] || text).trim();
  const tokens = script.split(/\s+/).filter(Boolean);
  return {
    title: (titleM?.[1] || '').trim(),
    script,
    sources: (sourcesM?.[1] || '').trim(),
    tokens,
  };
}
