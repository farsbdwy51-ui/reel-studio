// Reel Studio v1 — سيرفر محلي على 127.0.0.1:4301 (localhost بس)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings, saveSettings, maskedSettings } from './src/settings.mjs';
import { Project, STAGES } from './src/pipeline.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4301);
const PUBLIC_DIR = path.join(ROOT, 'public');
const ASSETS_DIR = path.join(ROOT, 'assets');
const PROJECTS_DIR = path.join(ROOT, 'data', 'projects');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml',
};

const projects = new Map();

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function serveFile(res, file, req) {
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range && (ext === '.mp4' || ext === '.mp3' || ext === '.wav')) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      res.writeHead(206, {
        'content-type': type, 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);
    try {
      // ---------- settings ----------
      if (p === '/api/settings' && req.method === 'GET') {
        return sendJson(res, 200, maskedSettings(loadSettings()));
      }
      if (p === '/api/settings' && req.method === 'PUT') {
        const body = await readJson(req);
        return sendJson(res, 200, maskedSettings(saveSettings(body)));
      }
      if (p === '/api/voices' && req.method === 'POST') {
        const s = loadSettings();
        const { listVoices } = await import('./src/tts.mjs');
        return sendJson(res, 200, await listVoices({ baseUrl: s.elevenlabsBaseUrl, apiKey: s.elevenlabsKey }));
      }

      // ---------- projects ----------
      if (p === '/api/projects' && req.method === 'GET') {
        return sendJson(res, 200, [...projects.values()].map((x) => x.public()).reverse());
      }
      if (p === '/api/projects' && req.method === 'POST') {
        const body = await readJson(req);
        if (!body.topic) return sendJson(res, 400, { error: 'الموضوع مطلوب' });
        const proj = new Project({
          root: PROJECTS_DIR, topic: String(body.topic),
          lengthSeconds: body.lengthSeconds, approvals: body.approvals,
        });
        projects.set(proj.id, proj);
        proj.start();
        return sendJson(res, 200, proj.public());
      }

      const pm = p.match(/^\/api\/projects\/([\w-]+)(\/.*)?$/);
      if (pm) {
        const proj = projects.get(pm[1]);
        if (!proj) return sendJson(res, 404, { error: 'مشروع غير موجود' });
        const sub = pm[2] || '/';
        if (sub === '/' && req.method === 'GET') return sendJson(res, 200, proj.public());

        if (sub === '/events' && req.method === 'GET') {
          res.writeHead(200, {
            'content-type': 'text/event-stream', 'cache-control': 'no-cache',
            connection: 'keep-alive', 'x-accel-buffering': 'no',
          });
          res.write(`data: ${JSON.stringify({ type: 'state', state: proj.public() })}\n\n`);
          const send = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* closed */ } };
          proj.events.on('event', send);
          const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 15000);
          req.on('close', () => { clearInterval(ping); proj.events.off('event', send); });
          return;
        }

        const sm = sub.match(/^\/stages\/(\w+)\/(approve|rerun|cancel)$/);
        if (sm && req.method === 'POST') {
          if (!STAGES.includes(sm[1])) return sendJson(res, 400, { error: 'مرحلة غير معروفة' });
          if (sm[2] === 'approve') proj.approve(sm[1]);
          else if (sm[2] === 'rerun') proj.rerun(sm[1]);
          else proj.cancel(sm[1]);
          return sendJson(res, 200, proj.public());
        }

        if (sub === '/script' && req.method === 'PUT') {
          const body = await readJson(req);
          proj.editScript(String(body.script || ''));
          return sendJson(res, 200, proj.public());
        }
        if (sub === '/storyboard' && req.method === 'PUT') {
          const body = await readJson(req);
          proj.editStoryboard(body);
          return sendJson(res, 200, proj.public());
        }
        if (sub === '/audio' && req.method === 'POST') {
          const buf = await readRaw(req);
          if (!buf.length) return sendJson(res, 400, { error: 'ملف فاضي' });
          proj.setUploadedAudio(buf, String(req.headers['x-filename'] || 'voice.wav'));
          return sendJson(res, 200, proj.public());
        }
        if (sub === '/video' && req.method === 'GET') {
          const v = proj.state.render?.video;
          if (!v) { res.writeHead(404); return res.end('لسه'); }
          return serveFile(res, path.join(proj.dir, v), req);
        }
        if (sub === '/contact-sheet' && req.method === 'GET') {
          const c = proj.state.render?.contactSheet;
          if (!c) { res.writeHead(404); return res.end('لسه'); }
          return serveFile(res, path.join(proj.dir, c), req);
        }
        return sendJson(res, 404, { error: 'مسار غير معروف' });
      }

      // ---------- static ----------
      if (p.startsWith('/assets/')) {
        const file = path.join(ASSETS_DIR, p.slice('/assets/'.length));
        if (!file.startsWith(ASSETS_DIR)) { res.writeHead(403); return res.end(); }
        return serveFile(res, file, req);
      }
      let rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
      const file = path.join(PUBLIC_DIR, rel);
      if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file, req);
    } catch (e) {
      return sendJson(res, 500, { error: String(e.message || e) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`ريل ستوديو شغال على http://${HOST}:${PORT}`);
  });
}
