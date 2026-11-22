/* Reel Studio v1 — واجهة RTL */
const $ = (id) => document.getElementById(id);
const STAGE_NAMES = { script: 'السكريبت', voice: 'الصوت', timing: 'التوقيت', storyboard: 'الستوري بورد', render: 'الريندر' };
const STATUS_NAMES = { idle: 'فاضي', running: 'شغال…', review: 'مستنى موافقتك', done: 'تم', error: 'خطأ' };

let project = null;
let es = null;

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

$('createBtn').onclick = async () => {
  const topic = $('topic').value.trim();
  if (!topic) return alert('اكتب الموضوع الأول');
  const mode = $('approvalMode').value;
  const approvals = Object.fromEntries(Object.keys(STAGE_NAMES).map((s) => [s, mode]));
  project = await api('/api/projects', 'POST', { topic, lengthSeconds: Number($('length').value), approvals });
  openProject();
};

function openProject() {
  $('projectView').classList.remove('hidden');
  $('scriptStream').textContent = '';
  if (es) es.close();
  es = new EventSource(`/api/projects/${project.id}/events`);
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'state') { project = ev.state; renderProject(); }
    else if (ev.type === 'log') appendLog(ev.stage, ev.msg);
    else if (ev.type === 'llm' && ev.stage === 'script') { $('scriptStream').textContent = ev.text; }
    else if (ev.type === 'progress') {
      $('renderProgress').classList.remove('hidden');
      $('prog').value = ev.done / ev.total;
      $('progText').textContent = ` ${ev.done}/${ev.total} فريم`;
    }
    else if (ev.type === 'preview') {
      const img = $('preview');
      img.classList.remove('hidden');
      img.src = 'data:image/jpeg;base64,' + ev.jpeg;
    }
  };
  renderProject();
}

function renderProject() {
  $('projTitle').textContent = project.topic;
  const running = project.running;
  $('projStatus').textContent = running ? `شغال: ${STAGE_NAMES[project.currentStage] || ''}` : (project.hasVideo ? 'جاهز ✅' : 'واقف');
  const wrap = $('stages');
  wrap.innerHTML = '';
  for (const [stage, info] of Object.entries(project.stages)) {
    const div = document.createElement('div');
    div.className = 'stage';
    div.innerHTML = `
      <div class="head">
        <span class="name">${STAGE_NAMES[stage]}</span>
        <span class="badge ${info.status}">${STATUS_NAMES[info.status]}</span>
        <span class="btns">
          ${info.status === 'review' ? `<button data-a="approve" class="primary" style="width:auto;margin:0">✔ موافقة</button>` : ''}
          ${(info.status === 'running' || info.status === 'review') ? `<button data-a="cancel" class="ghost">✖ إلغاء</button>` : ''}
          ${(!running && info.status !== 'idle') ? `<button data-a="rerun" class="ghost">↻ إعادة</button>` : ''}
        </span>
      </div>
      <div class="log">${info.log.join('\n')}</div>`;
    div.querySelectorAll('button').forEach((b) => {
      b.onclick = async () => {
        try { project = await api(`/api/projects/${project.id}/stages/${stage}/${b.dataset.a}`, 'POST'); renderProject(); }
        catch (e) { alert(e.message); }
      };
    });
    wrap.appendChild(div);
  }
  // السكريبت
  if (project.script) {
    $('scriptStream').textContent = `TITLE: ${project.script.title}\nSCRIPT:\n${project.script.script}\nSOURCES:\n${project.script.sources}`;
    $('editScriptBtn').classList.remove('hidden');
  }
  // الستوري بورد
  if (project.storyboard) $('storyboardJson').textContent = JSON.stringify(project.storyboard, null, 2);
  // الفيديو
  if (project.hasVideo) {
    const v = $('video');
    if (!v.src) {
      v.src = `/api/projects/${project.id}/video?ts=${Date.now()}`;
      v.classList.remove('hidden');
      const cs = $('contactSheet');
      cs.src = `/api/projects/${project.id}/contact-sheet?ts=${Date.now()}`;
      cs.classList.remove('hidden');
    }
  }
}

function appendLog(stage, msg) {
  const info = project?.stages?.[stage];
  if (info) { info.log.push(msg); }
  renderProject();
}

$('editScriptBtn').onclick = () => {
  $('scriptEdit').value = `TITLE: ${project.script.title}\nSCRIPT:\n${project.script.script}\nSOURCES:\n${project.script.sources}`;
  $('scriptEdit').classList.remove('hidden');
  $('saveScriptBtn').classList.remove('hidden');
};
$('saveScriptBtn').onclick = async () => {
  project = await api(`/api/projects/${project.id}/script`, 'PUT', { script: $('scriptEdit').value });
  $('scriptEdit').classList.add('hidden');
  $('saveScriptBtn').classList.add('hidden');
  renderProject();
};

$('uploadAudioBtn').onclick = async () => {
  const f = $('audioFile').files[0];
  if (!f) return alert('اختار ملف صوت');
  const res = await fetch(`/api/projects/${project.id}/audio`, {
    method: 'POST',
    headers: { 'x-filename': f.name, 'content-type': f.type || 'audio/wav' },
    body: f,
  });
  const j = await res.json();
  if (!res.ok) return alert(j.error || 'فشل الرفع');
  project = j;
  alert('اترفع — شغّل مرحلة الصوت من تاني');
  renderProject();
};

// ---------- الإعدادات ----------
$('settingsBtn').onclick = async () => {
  const s = await api('/api/settings');
  const form = $('settingsForm');
  for (const el of form.elements) {
    if (el.name && s[el.name] !== undefined) el.value = s[el.name];
  }
  $('settingsDialog').showModal();
};
$('saveSettingsBtn').onclick = async (e) => {
  e.preventDefault();
  const form = $('settingsForm');
  const body = {};
  for (const el of form.elements) if (el.name) body[el.name] = el.value;
  await api('/api/settings', 'PUT', body);
  $('settingsDialog').close();
};
$('loadVoicesBtn').onclick = async () => {
  try {
    const voices = await api('/api/voices', 'POST');
    const sel = $('voicesList');
    sel.innerHTML = voices.map((v) => `<option value="${v.id}">${v.name}</option>`).join('');
    sel.classList.remove('hidden');
    sel.onchange = () => { document.querySelector('[name=elevenlabsVoiceId]').value = sel.value; };
  } catch (e) { alert(e.message); }
};
