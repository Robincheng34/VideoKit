'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function fmtSize(b) {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 3500);
}

const ICON = {
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M7 4.5v15l13-7.5z"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  asr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
  subtitle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
  decrypt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v8h6"/><path d="M9 13h6M9 17h4"/></svg>'
};

/* ── 主题 ── */
let settings = null;
let systemDark = true;
function applyTheme() {
  const mode = settings ? settings.theme : 'system';
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  document.body.dataset.theme = dark ? 'dark' : 'light';
}
api.theme.onChanged(d => { systemDark = d; applyTheme(); });

/* ── 托盘图标（矢量绘制，单色） ── */
(function sendTrayIcon() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = '#3E8F6F';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(16, 5); g.lineTo(16, 19); g.stroke();
  g.beginPath(); g.moveTo(9, 13); g.lineTo(16, 20); g.lineTo(23, 13); g.stroke();
  g.beginPath(); g.moveTo(6, 25); g.lineTo(26, 25); g.stroke();
  api.trayIcon(c.toDataURL('image/png'));
})();

/* ── 导航 ── */
let currentPage = 'tasks';
function gotoPage(name) {
  currentPage = name;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'library') loadLibrary();
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => gotoPage(b.dataset.page)));

$('#btn-min').onclick = () => api.win.minimize();
$('#btn-max').onclick = () => api.win.maximize();
$('#btn-close').onclick = () => api.win.close();

/* ── 弹窗 ── */
let dialogClose = null;
function openDialog({ title, body, buttons }) {
  return new Promise(resolve => {
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = body;
    const footer = $('#dialog-footer');
    footer.innerHTML = '';
    const close = val => {
      $('#dialog-root').classList.add('hidden');
      dialogClose = null;
      resolve(val);
    };
    dialogClose = close;
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      el.textContent = b.label;
      el.onclick = () => close(b.value);
      footer.appendChild(el);
    });
    $('#dialog-root').classList.remove('hidden');
    (footer.querySelector('.primary') || footer.querySelector('.danger') || footer.querySelector('.btn'))?.focus();
  });
}
$('#dialog-scrim').onclick = () => dialogClose && dialogClose(null);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dialogClose) dialogClose(null);
});
const confirmDialog = (title, msg, okLabel = '删除') =>
  openDialog({ title, body: `<p class="dlg-msg">${esc(msg)}</p>`, buttons: [{ label: '取消', value: false }, { label: okLabel, value: true, danger: true }] });
const errorDialog = (title, msg) =>
  openDialog({ title, body: `<p class="dlg-msg">${esc(msg)}</p>`, buttons: [{ label: '复制错误', value: 'copy' }, { label: '关闭', value: null, primary: true }] })
    .then(v => { if (v === 'copy') api.clipboard.write(msg); });

/* ── 任务状态 ── */
const tasks = new Map();
const prevStatus = new Map();
const selection = new Set();
let taskView = 'list';
let sortKey = 'time';
let sortDesc = true;
let searchTerm = '';
let renderQueued = false;

const STATUS_TEXT = { queued: '等待', running: '下载中', paused: '已暂停', verifying: '校验中', done: '已完成', error: '失败', cancelled: '已取消' };
const TYPE_LABEL = { download: '下载', convert: '转换', extract: '提取', watermark: '去水印', asr: '识别', subtitle: '字幕', decrypt: '解密', lyrics: '歌词' };

function statusText(t) {
  if (t.status === 'running') {
    if (t.phase) return t.phase;
    if (t.finishing) return '写入文件';
    const extra = [t.speed, t.eta ? '剩余 ' + t.eta : ''].filter(Boolean).join(' · ');
    return extra || (t.type === 'download' ? STATUS_TEXT.running : '处理中');
  }
  if (t.status === 'verifying') return '校验中';
  if (t.status === 'error') return '失败';
  return STATUS_TEXT[t.status] || t.status;
}

function taskMeta(t) {
  const m = t.meta || {};
  const parts = [
    m.duration ? fmtTime(m.duration) : null,
    m.resolution || null,
    m.codec || null,
    m.size ? fmtSize(m.size) : null
  ].filter(Boolean);
  if (t.status === 'running' && t.speed) parts.push(t.speed);
  if (t.status === 'running' && t.eta) parts.push('剩余 ' + t.eta);
  return parts.join('<span class="sep">｜</span>');
}

function actionButtons(t) {
  const b = [];
  if (t.type === 'download' && (t.status === 'running' || t.status === 'queued'))
    b.push(`<button class="icon-btn" data-act="pause" title="暂停">${ICON.pause}</button>`);
  if (t.status === 'paused')
    b.push(`<button class="icon-btn" data-act="resume" title="继续">${ICON.play}</button>`);
  if (['error', 'cancelled'].includes(t.status))
    b.push(`<button class="icon-btn" data-act="retry" title="重试">${ICON.retry}</button>`);
  if (t.status === 'done' && t.outputPath)
    b.push(`<button class="icon-btn" data-act="reveal" title="打开目录">${ICON.folder}</button>`);
  b.push(`<button class="icon-btn" data-act="remove" title="删除">${ICON.trash}</button>`);
  return b.join('');
}

function thumbHTML(t, cls) {
  if (t.thumb) return `<img class="${cls}" src="${esc(t.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy">`;
  const ph = t.type === 'extract' ? ICON.audio : t.type === 'decrypt' ? ICON.decrypt : t.type === 'asr' ? ICON.asr : t.type === 'subtitle' ? ICON.subtitle : t.type === 'lyrics' ? ICON.lyrics : ICON.video;
  return `<span class="${cls} placeholder">${ph}</span>`;
}

function rowHTML(t) {
  const pct = t.status === 'done' ? '100%' : t.progress.toFixed(1) + '%';
  const errTitle = t.status === 'error' ? ` title="${esc(t.error)}"` : '';
  return `<input type="checkbox" class="sel" data-act="select" ${selection.has(t.id) ? 'checked' : ''} aria-label="选择任务">
    ${thumbHTML(t, 'task-thumb')}
    <div class="t-body">
      <div class="t-title" title="${esc(t.title)}">${esc(t.title)}</div>
      <div class="t-meta">${taskMeta(t)}</div>
      ${t.status === 'error' ? `<div class="t-error" title="${esc(t.error)}">${esc((t.error || '').split('\n')[0])}</div>` : ''}
      <div class="t-prog">
        <div class="progress-track"><div class="progress-fill" style="width:${t.progress}%"></div></div>
        <span class="t-pct">${pct}</span>
        <span class="t-status ${t.status}"${errTitle}>${esc(statusText(t))}</span>
      </div>
    </div>
    <div class="t-actions">${actionButtons(t)}</div>`;
}

function cardHTML(t) {
  const pct = t.status === 'done' ? '100%' : t.progress.toFixed(1) + '%';
  const errTitle = t.status === 'error' ? ` title="${esc(t.error)}"` : '';
  return `${thumbHTML(t, 'card-thumb')}
    <div class="card-body">
      <div class="t-title" title="${esc(t.title)}">${esc(t.title)}</div>
      <div class="card-status">
        <span class="t-status ${t.status}"${errTitle}>${esc(statusText(t))}</span>
        <span class="t-pct">${pct}</span>
      </div>
      <div class="t-prog"><div class="progress-track"><div class="progress-fill" style="width:${t.progress}%"></div></div></div>
      <div class="t-actions">${actionButtons(t)}</div>
    </div>`;
}

function sortedTasks(list) {
  const dir = sortDesc ? -1 : 1;
  const statusOrder = { running: 0, queued: 1, paused: 2, verifying: 3, error: 4, done: 5, cancelled: 6 };
  return list.sort((a, b) => {
    let r = 0;
    if (sortKey === 'time') r = a.createdAt - b.createdAt;
    else if (sortKey === 'size') r = (a.meta?.size || 0) - (b.meta?.size || 0);
    else if (sortKey === 'name') r = a.title.localeCompare(b.title, 'zh');
    else r = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    return r * dir;
  });
}

function renderTasks() {
  renderQueued = false;
  const all = [...tasks.values()];
  const term = searchTerm.trim().toLowerCase();
  const visible = term ? all.filter(t => t.title.toLowerCase().includes(term)) : all;
  const active = sortedTasks(visible.filter(t => ['queued', 'running', 'paused', 'verifying', 'error'].includes(t.status)));
  const done = sortedTasks(visible.filter(t => ['done', 'cancelled'].includes(t.status)));
  $('#count-active').textContent = String(active.length);
  $('#count-done').textContent = String(done.length);
  const activeCount = all.filter(t => ['queued', 'running'].includes(t.status)).length;
  const badge = $('#nav-active-count');
  badge.textContent = String(activeCount);
  badge.classList.toggle('hidden', activeCount === 0);
  $('#task-empty').classList.toggle('hidden', all.length > 0);

  const fill = (el, list) => {
    el.className = taskView === 'grid' ? 'task-grid' : 'task-list';
    el.innerHTML = list.map(t => {
      const sel = selection.has(t.id) ? ' selected' : '';
      return taskView === 'grid'
        ? `<div class="task-card ${t.status}${sel}" data-id="${t.id}">${cardHTML(t)}</div>`
        : `<div class="task-row ${t.status}${sel}" data-id="${t.id}">${rowHTML(t)}</div>`;
    }).join('');
  };
  fill($('#task-list-active'), active);
  fill($('#task-list-done'), done);
}
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(renderTasks);
}

api.tasks.onUpdate(t => {
  const prev = prevStatus.get(t.id);
  tasks.set(t.id, t);
  prevStatus.set(t.id, t.status);
  queueRender();
  if (prev && prev !== t.status) {
    if (t.status === 'done') {
      toast(`${TYPE_LABEL[t.type]}完成：${t.title}`, 'success');
      scheduleLibraryRefresh();
      if (t.type === 'asr' && t.outputPath) {
        api.subtitle.load(t.outputPath).then(r => {
          subState.entries = r.entries; subState.format = r.format;
          renderSubList();
          gotoPage('subtitle');
          toast(`识别完成：${r.entries.length} 条字幕，可编辑后输出`, 'success');
        }).catch(() => {});
      }
    }
    if (t.status === 'error') toast(`${TYPE_LABEL[t.type]}失败：${t.title}（${(t.error || '').split('\n')[0].slice(0, 80)}）`, 'error');
  }
});
api.tasks.onRemove(id => {
  tasks.delete(id);
  prevStatus.delete(id);
  selection.delete(id);
  queueRender();
});

/* 任务交互（事件委托） */
async function taskAction(act, id) {
  const t = tasks.get(id);
  if (act === 'select') {
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    queueRender();
    return;
  }
  if (act === 'pause') await api.tasks.pause(id);
  else if (act === 'resume') await api.tasks.resume(id);
  else if (act === 'retry') await api.tasks.retry(id);
  else if (act === 'reveal' && t?.outputPath) api.shell.reveal(t.outputPath);
  else if (act === 'remove') {
    const ok = await confirmDialog('删除任务', `确定删除任务「${t ? t.title : id}」？\n不会删除已下载的文件。`, '删除');
    if (ok) await api.tasks.remove(id);
  }
}
for (const el of [$('#task-list-active'), $('#task-list-done')]) {
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = parseInt(row.dataset.id);
    if (btn) { taskAction(btn.dataset.act, id); return; }
  });
  el.addEventListener('contextmenu', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    e.preventDefault();
    api.tasks.context(parseInt(row.dataset.id), e.clientX, e.clientY);
  });
}

/* 工具栏 */
$('#task-search').addEventListener('input', e => { searchTerm = e.target.value; queueRender(); });
$('#task-sort').addEventListener('change', e => { sortKey = e.target.value; queueRender(); });
$('#task-sort-dir').onclick = () => { sortDesc = !sortDesc; queueRender(); };
$$('#task-view .seg-btn').forEach(b => b.onclick = () => {
  taskView = b.dataset.view;
  $$('#task-view .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  queueRender();
});
$('#btn-pause-all').onclick = () => api.tasks.pauseAll();
$('#btn-resume-all').onclick = () => api.tasks.resumeAll();
$('#btn-clear-tasks').onclick = async () => {
  const n = [...tasks.values()].filter(t => ['done', 'error', 'cancelled'].includes(t.status)).length;
  if (!n) return toast('没有可清除的任务');
  const ok = await confirmDialog('全部清除', `清除 ${n} 条已完成 / 失败 / 已取消的任务记录？\n不会删除已下载的文件。`, '清除');
  if (ok) api.tasks.clear();
};
$('#btn-open-dir').onclick = () => api.shell.open(settings.downloadDir);

/* 快捷键 */
document.addEventListener('keydown', async e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const inField = ['input', 'textarea', 'select'].includes(tag);
  if (e.ctrlKey && e.key.toLowerCase() === 'v' && !inField) {
    e.preventDefault();
    gotoPage('parse');
    try {
      const text = await navigator.clipboard.readText();
      if (text) { $('#url-input').value = text.trim(); $('#url-input').focus(); }
    } catch {}
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && !inField && currentPage === 'tasks') {
    e.preventDefault();
    $$('#task-list-active [data-id], #task-list-done [data-id]').forEach(el => selection.add(parseInt(el.dataset.id)));
    queueRender();
  }
  if (e.key === 'Delete' && !inField && currentPage === 'tasks' && selection.size) {
    e.preventDefault();
    const ok = await confirmDialog('删除任务', `删除选中的 ${selection.size} 个任务？\n不会删除已下载的文件。`, '删除');
    if (ok) for (const id of [...selection]) await api.tasks.remove(id);
  }
});

/* 原生右键触发的弹窗 */
api.tasks.onQualityDialog(async id => {
  const t = tasks.get(id);
  if (!t || !t.info) return;
  const rows = t.info.rows || [];
  const body = `<div class="fmt-table" id="dlg-fmt">${rows.map((r, i) => `
    <label class="fmt-row${i === 0 ? ' selected' : ''}">
      <input type="radio" name="dlg-quality" value="${esc(r.key)}" ${i === 0 ? 'checked' : ''}>
      <span>${r.height ? r.height + 'P' : '仅音频'}</span>
      <span>${esc(r.vcodec || r.acodec || '—')}</span>
      <span>${r.fps ? r.fps + 'fps' : '—'}</span>
      <span>${fmtSize(r.size)}</span>
      <span>${esc(r.acodec || '—')}</span>
      <span class="col-subs">${r.subs ? r.subs + ' 条字幕' : '—'}</span>
    </label>`).join('')}</div>`;
  const val = await openDialog({ title: '选择清晰度重新下载', body, buttons: [{ label: '取消', value: null }, { label: '开始下载', value: 'ok', primary: true }] });
  if (val !== 'ok') return;
  const key = document.querySelector('input[name="dlg-quality"]:checked')?.value || rows[0]?.key;
  try {
    await api.download({ url: t.info.webpage, info: t.info, formatKey: key, merge: settings.mergeAV, subs: settings.downloadSubs || settings.autoSubs, audioFormat: 'mp3' });
    toast('已加入任务队列', 'success');
  } catch (e) { errorDialog('下载失败', e.message); }
});
api.tasks.onDeleteDialog(async id => {
  const t = tasks.get(id);
  const ok = await confirmDialog('删除任务', `确定删除任务「${t ? t.title : id}」？`, '删除');
  if (ok) api.tasks.remove(id);
});
/* 弹窗内格式行选中态 */
$('#dialog-body').addEventListener('change', e => {
  if (e.target.name === 'dlg-quality') {
    $$('#dlg-fmt .fmt-row').forEach(r => r.classList.toggle('selected', r.contains(e.target)));
  }
});

/* ── 链接解析 ── */
let parsedInfo = null;
let selectedFormat = null;

$('#url-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-parse').click(); });
$('#opt-audio-only').addEventListener('change', e => {
  $('#opt-audio-fmt').classList.toggle('hidden', !e.target.checked);
  if (parsedInfo) renderFmtTable();
});
$('#btn-parse').onclick = async () => {
  const url = $('#url-input').value.trim();
  if (!url) return toast('请先粘贴视频链接', 'error');
  if (!/^https?:\/\//i.test(url)) return errorDialog('链接无效', '请输入以 http(s):// 开头的视频链接。');
  $('#parse-loading').classList.remove('hidden');
  $('#parse-result').classList.add('hidden');
  $('#parse-empty').classList.add('hidden');
  $('#btn-parse').disabled = true;
  try {
    parsedInfo = await api.parse(url);
    renderParseResult();
  } catch (e) {
    $('#parse-empty').classList.remove('hidden');
    errorDialog('解析失败', e.message || String(e));
  } finally {
    $('#parse-loading').classList.add('hidden');
    $('#btn-parse').disabled = false;
  }
};

function renderParseResult() {
  const info = parsedInfo;
  $('#result-thumb').src = info.thumbnail || '';
  $('#result-thumb').style.display = info.thumbnail ? '' : 'none';
  $('#result-title').textContent = info.title;
  $('#result-meta').innerHTML = [
    esc(info.uploader || ''), esc(info.extractor || ''),
    info.duration ? fmtTime(info.duration) : null,
    info.subtitles?.length ? info.subtitles.length + ' 条字幕' : null
  ].filter(Boolean).join('<span class="sep">｜</span>');
  renderFmtTable();
  $('#parse-result').classList.remove('hidden');
}

function renderFmtTable() {
  const info = parsedInfo;
  const audioOnly = $('#opt-audio-only').checked;
  const rows = info.rows || [];
  const table = $('#fmt-table');
  table.innerHTML = `<div class="fmt-row head"><span></span><span>分辨率</span><span>编码</span><span>帧率</span><span>预估大小</span><span>音频轨道</span><span class="col-subs">字幕</span></div>` +
    rows.map(r => {
      const disabled = audioOnly && r.key !== 'audio';
      return `<label class="fmt-row${disabled ? ' disabled' : ''}" data-key="${esc(r.key)}">
        <input type="radio" name="fmt" value="${esc(r.key)}" ${disabled ? 'disabled' : ''}>
        <span>${r.height ? r.height + 'P' : '仅音频'}</span>
        <span>${esc(r.vcodec || r.acodec || '—')}</span>
        <span>${r.fps ? r.fps + 'fps' : '—'}</span>
        <span>${fmtSize(r.size)}</span>
        <span>${esc(r.acodec || '—')}</span>
        <span class="col-subs">${r.subs ? r.subs + ' 条' : '—'}</span>
      </label>`;
    }).join('');
  const want = audioOnly ? 'audio' : (settings.defaultQuality !== 'best' ? settings.defaultQuality : null);
  const target = rows.find(r => r.key === want && !(audioOnly && r.key !== 'audio')) || rows.find(r => !audioOnly || r.key === 'audio') || rows[0];
  selectedFormat = target ? target.key : null;
  table.querySelectorAll('.fmt-row:not(.head)').forEach(el => {
    const on = el.dataset.key === selectedFormat;
    el.classList.toggle('selected', on);
    el.querySelector('input').checked = on;
  });
}
$('#fmt-table').addEventListener('change', e => {
  if (e.target.name !== 'fmt') return;
  selectedFormat = e.target.value;
  $$('#fmt-table .fmt-row').forEach(r => r.classList.toggle('selected', r.contains(e.target)));
});

$('#btn-download').onclick = async () => {
  if (!parsedInfo || !selectedFormat) return;
  try {
    await api.download({
      url: parsedInfo.webpage,
      info: parsedInfo,
      formatKey: selectedFormat,
      merge: $('#opt-merge').checked,
      subs: $('#opt-subs').checked,
      audioFormat: $('#opt-audio-fmt').value
    });
    toast('已加入任务队列', 'success');
    gotoPage('tasks');
  } catch (e) { errorDialog('无法开始下载', e.message); }
};

/* ── 本地库 ── */
let libEntries = [];
let libLoaded = false;
let libRefreshTimer = null;
function scheduleLibraryRefresh() {
  clearTimeout(libRefreshTimer);
  libRefreshTimer = setTimeout(() => { if (libLoaded) loadLibrary(); }, 1500);
}
async function loadLibrary() {
  libLoaded = true;
  libEntries = await api.library.list();
  renderLibrary();
}
function libFiltered() {
  const t = $('#lib-time').value, f = $('#lib-format').value, r = $('#lib-res').value;
  const now = Date.now();
  const span = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 }[t];
  return libEntries.filter(e => {
    if (span && now - e.mtime > span) return false;
    if (f === 'video' && ['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(e.ext)) return false;
    if (f === 'audio' && !['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(e.ext)) return false;
    if (!['all', 'video', 'audio'].includes(f) && e.ext !== f) return false;
    return true;
  });
}
async function renderLibrary() {
  const list = libFiltered();
  $('#lib-count').textContent = `${list.length} 个文件`;
  $('#lib-empty').classList.toggle('hidden', list.length > 0);
  const grid = $('#lib-grid');
  grid.innerHTML = list.map(e => `
    <div class="lib-card" data-path="${esc(e.path)}">
      <span class="card-thumb audio-ph" data-thumb>${ICON.video}</span>
      <div class="card-body">
        <div class="t-title" title="${esc(e.name)}">${esc(e.name)}</div>
        <div class="meta-line" data-info>${fmtSize(e.size)}</div>
        <div class="t-actions">
          <button class="icon-btn" data-act="play" title="播放">${ICON.play}</button>
          <button class="icon-btn" data-act="reveal" title="打开文件夹">${ICON.folder}</button>
          <button class="icon-btn" data-act="copy" title="复制文件名">${ICON.copy}</button>
          <button class="icon-btn" data-act="delete" title="删除文件">${ICON.trash}</button>
        </div>
      </div>
    </div>`).join('');
  const queue = [...list];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const e = queue.shift();
      const card = grid.querySelector(`[data-path="${CSS.escape(e.path)}"]`);
      if (!card) continue;
      try {
        const info = await api.library.info(e.path);
        const res = $('#lib-res').value;
        if (res !== 'all') {
          const h = info.height || 0;
          const ok = res === '2160' ? h >= 2160 : res === '1080' ? h >= 1080 && h < 2160 : res === '720' ? h >= 720 && h < 1080 : h < 720;
          if (!ok) { card.remove(); continue; }
        }
        const meta = card.querySelector('[data-info]');
        meta.innerHTML = [info.height ? info.height + 'P' : '音频', info.duration ? fmtTime(info.duration) : null, fmtSize(e.size)]
          .filter(Boolean).join('<span class="sep">｜</span>');
        const thumb = await api.library.thumb(e.path);
        const ph = card.querySelector('[data-thumb]');
        if (thumb && ph) {
          const img = document.createElement('img');
          img.className = 'card-thumb';
          img.src = thumb;
          img.alt = '';
          ph.replaceWith(img);
        } else if (ph && ['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(e.ext)) {
          ph.innerHTML = ICON.audio;
        }
      } catch {}
    }
  });
  await Promise.all(workers);
  $('#lib-count').textContent = `${grid.children.length} 个文件`;
}
['#lib-time', '#lib-format', '#lib-res'].forEach(s => $(s).addEventListener('change', renderLibrary));
$('#btn-lib-refresh').onclick = loadLibrary;
$('#lib-grid').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  const card = e.target.closest('[data-path]');
  if (!btn || !card) return;
  const p = card.dataset.path;
  const act = btn.dataset.act;
  if (act === 'play') api.shell.open(p);
  else if (act === 'reveal') api.shell.reveal(p);
  else if (act === 'copy') { api.clipboard.write(p.split(/[\\/]/).pop()); toast('已复制文件名'); }
  else if (act === 'delete') {
    const ok = await confirmDialog('删除文件', `确定从磁盘删除「${p.split(/[\\/]/).pop()}」？\n此操作不可恢复。`, '删除');
    if (ok) {
      try { await api.library.delete(p); card.remove(); toast('已删除', 'success'); }
      catch (err) { errorDialog('删除失败', err.message); }
    }
  }
});

/* ── 设置 ── */
function updateCookieStatus() {
  $('#cookie-status').textContent = settings.cookieFile ? '已启用：' + settings.cookieFile : '未启用';
}
async function refreshTools() {
  const t = await api.env.check();
  const setMini = (id, ok, name, ver) => {
    const el = $(id);
    el.className = 'engine-row-mini ' + (ok ? 'ok' : 'bad');
    el.querySelector('.ec-pill').textContent = ok ? '在线' : '缺失';
    el.querySelector('strong').textContent = name;
    el.querySelector('small').textContent = ok ? (ver || '') : '未检测到';
    el.title = ok ? `${name} ${ver || ''}` : `${name} 未检测到，请在设置中配置`;
  };
  setMini('#ec-ffmpeg', t.ffmpeg, 'ffmpeg', t.ffmpegVersion);
  setMini('#ec-ytdlp', t.ytdlp, 'yt-dlp', t.ytdlpVersion);
  $('#eng-ffmpeg-dot').className = 'dot ' + (t.ffmpeg ? 'ok' : 'bad');
  $('#eng-ytdlp-dot').className = 'dot ' + (t.ytdlp ? 'ok' : 'bad');
  $('#eng-ffmpeg-text').textContent = t.ffmpeg ? `ffmpeg ${t.ffmpegVersion}` : 'ffmpeg 未检测到';
  $('#eng-ytdlp-text').textContent = t.ytdlp ? `yt-dlp ${t.ytdlpVersion}` : 'yt-dlp 未检测到';
  $('#parse-engine-label').textContent = t.ytdlp ? `yt-dlp（本地）${t.ytdlpVersion}` : 'yt-dlp（本地）未检测到';
  $('#gpu-hint').textContent = t.gpu && t.gpu.nvenc ? `NVENC 可用 · ${t.gpu.name || 'NVIDIA GPU'}` : '未检测到 NVENC，将使用 CPU';
  return t;
}

function closeDialog() { if (dialogClose) dialogClose(null); }

async function startupEnvCheck() {
  const t = await refreshTools();
  const rows = [
    { ok: t.ffmpeg, name: 'ffmpeg', detail: t.ffmpeg ? `${t.ffmpegVersion} · ${t.ffmpegPath}` : '未检测到：安装 ffmpeg 或在 设置→高级 指定路径', fix: '媒体处理 / 校验必需' },
    { ok: t.ffprobe, name: 'ffprobe', detail: t.ffprobe ? '随 ffmpeg 提供' : '未检测到：需与 ffmpeg 同目录', fix: '媒体信息读取必需' },
    { ok: t.ytdlp, name: 'yt-dlp', detail: t.ytdlp ? `${t.ytdlpVersion} · ${t.ytdlpPath}` : '未检测到：pip install yt-dlp 或指定路径', fix: '链接解析 / 下载必需' },
    { ok: t.node, name: 'Node 运行时', detail: t.node ? t.nodeVersion : '未检测到：YouTube 签名求解需要 Node ≥ 22', fix: '影响 YouTube 高清晰度', warnOnly: true },
    { ok: !!(t.gpu && t.gpu.nvenc), name: 'GPU 编码 (NVENC)', detail: t.gpu && t.gpu.nvenc ? (t.gpu.name || 'NVIDIA GPU') : '未检测到：水印/转换将使用 CPU 编码', fix: '可选，GPU 加速', warnOnly: true },
    { ok: !!(t.python && t.python.ok && t.python.whisper), name: 'Python / faster-whisper', detail: t.python && t.python.ok ? (t.python.whisper ? `Python ${t.python.version} · faster-whisper 就绪` : `Python ${t.python.version} · 缺 faster-whisper：pip install faster-whisper`) : '未检测到 Python：语音识别不可用', fix: '语音识别必需', warnOnly: true },
    { ok: t.dirWritable, name: '输出目录可写', detail: t.downloadDir, fix: '下载 / 处理结果保存位置' },
    { ok: t.cookies, name: '平台 Cookies', detail: t.cookies ? '已启用' : '未启用：B站高码率 / YouTube 需登录态', fix: '可选', warnOnly: true }
  ];
  const allOk = rows.every(r => r.ok || r.warnOnly);
  const body = rows.map(r => `
    <div class="env-row ${r.ok ? 'ok' : r.warnOnly ? 'warn' : 'bad'}">
      <span class="ec-pill">${r.ok ? '正常' : r.warnOnly ? '可选' : '缺失'}</span>
      <div class="env-info"><strong>${esc(r.name)}</strong><small>${esc(r.detail)}${r.ok ? '' : ' — ' + esc(r.fix)}</small></div>
    </div>`).join('');
  const val = await openDialog({
    title: '环境检测',
    body,
    buttons: [
      { label: '重新检测', value: 'recheck' },
      { label: '打开设置', value: 'settings' },
      { label: allOk ? '进入应用' : '仍要进入', value: 'enter', primary: true }
    ]
  });
  if (val === 'recheck') return startupEnvCheck();
  if (val === 'settings') gotoPage('settings');
}
async function initSettings() {
  settings = await api.settings.get();
  systemDark = await api.theme.current();
  applyTheme();
  $('#set-dir').value = settings.downloadDir;
  $('#set-concurrent').value = String(settings.maxConcurrent);
  $('#set-threads').value = String(settings.downloadThreads);
  $('#set-speed').value = String(settings.speedLimit);
  $('#speed-limit-label').textContent = settings.speedLimit ? settings.speedLimit + ' KB/s' : '不限速';
  $('#set-wired').checked = settings.wiredOnly;
  $('#set-codec').value = settings.codecPref;
  $('#set-encoder').value = settings.encoder || 'auto';
  $('#set-quality').value = settings.defaultQuality;
  $('#set-autosubs').checked = settings.autoSubs;
  $('#set-theme').value = settings.theme;
  $('#set-startup').value = settings.startupSize;
  $('#set-tray').checked = settings.minimizeToTray;
  $('#set-proxy').value = settings.proxy;
  $('#set-ffmpeg').value = settings.ffmpegPath;
  $('#set-ytdlp').value = settings.ytdlpPath;
  $('#set-python').value = settings.pythonPath || '';
  $('#set-osuser').value = settings.osUser || '';
  $('#set-ospass').value = settings.osPass || '';
  $('#set-log').checked = settings.logEnabled;
  $('#set-verify').checked = settings.verifyOutput !== false;
  $('#opt-merge').checked = settings.mergeAV;
  $('#opt-subs').checked = settings.downloadSubs || settings.autoSubs;
  $('#download-dir-hint').textContent = '保存到 ' + settings.downloadDir;
  updateCookieStatus();
  await refreshTools();
  refreshLoginStatus();
}
async function save(patch) {
  settings = await api.settings.set(patch);
  $('#download-dir-hint').textContent = '保存到 ' + settings.downloadDir;
}
$('#set-dir').addEventListener('change', e => save({ downloadDir: e.target.value.trim() || settings.downloadDir }));
$('#pick-dir').onclick = async () => { const d = await api.dialog.dir(); if (d) { $('#set-dir').value = d; save({ downloadDir: d }); } };
$('#open-dir').onclick = () => api.shell.open(settings.downloadDir);
$('#set-concurrent').addEventListener('change', e => save({ maxConcurrent: parseInt(e.target.value) }));
$('#set-threads').addEventListener('change', e => save({ downloadThreads: parseInt(e.target.value) }));
$('#set-speed').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  $('#speed-limit-label').textContent = v ? v + ' KB/s' : '不限速';
});
$('#set-speed').addEventListener('change', e => save({ speedLimit: parseInt(e.target.value) }));
$('#set-wired').addEventListener('change', e => save({ wiredOnly: e.target.checked }));
$('#set-codec').addEventListener('change', e => save({ codecPref: e.target.value }));
$('#set-encoder').addEventListener('change', e => save({ encoder: e.target.value }));
$('#set-quality').addEventListener('change', e => save({ defaultQuality: e.target.value }));
$('#set-autosubs').addEventListener('change', e => save({ autoSubs: e.target.checked }));
$('#set-theme').addEventListener('change', async e => { await save({ theme: e.target.value }); applyTheme(); });
$('#set-startup').addEventListener('change', e => save({ startupSize: e.target.value }));
$('#set-tray').addEventListener('change', e => save({ minimizeToTray: e.target.checked }));
$('#set-proxy').addEventListener('change', e => save({ proxy: e.target.value.trim() }));
$('#set-ffmpeg').addEventListener('change', async e => { await save({ ffmpegPath: e.target.value.trim() }); refreshTools(); });
$('#set-ytdlp').addEventListener('change', async e => { await save({ ytdlpPath: e.target.value.trim() }); refreshTools(); });
$('#set-python').addEventListener('change', async e => { await save({ pythonPath: e.target.value.trim() }); refreshTools(); });
$('#pick-python').onclick = async () => { const f = await api.dialog.file([{ name: '可执行文件', extensions: ['exe'] }]); if (f) { $('#set-python').value = f; await save({ pythonPath: f }); refreshTools(); } };
$('#set-osuser').addEventListener('change', e => save({ osUser: e.target.value.trim() }));
$('#set-ospass').addEventListener('change', e => save({ osPass: e.target.value }));
$('#btn-os-register').onclick = () => api.shell.external('https://www.opensubtitles.com/en/users/sign_up');
$('#set-log').addEventListener('change', e => save({ logEnabled: e.target.checked }));
$('#set-verify').addEventListener('change', e => save({ verifyOutput: e.target.checked }));
$('#pick-ffmpeg').onclick = async () => { const f = await api.dialog.file([{ name: '可执行文件', extensions: ['exe'] }]); if (f) { $('#set-ffmpeg').value = f; await save({ ffmpegPath: f }); refreshTools(); } };
$('#pick-ytdlp').onclick = async () => { const f = await api.dialog.file([{ name: '可执行文件', extensions: ['exe'] }]); if (f) { $('#set-ytdlp').value = f; await save({ ytdlpPath: f }); refreshTools(); } };
$('#btn-recheck').onclick = async () => { await api.settings.set({}); refreshTools(); toast('引擎状态已刷新'); };
$('#opt-merge').addEventListener('change', e => save({ mergeAV: e.target.checked }));
$('#opt-subs').addEventListener('change', e => save({ downloadSubs: e.target.checked }));

$$('[data-cookie-url]').forEach(b => b.onclick = async () => {
  toast('已打开登录窗口，登录成功后自动关闭并保存');
  const r = await api.cookies.login(b.dataset.cookieUrl);
  if (r.error) toast('Cookies 保存失败：' + r.error, 'error');
  else { settings = await api.settings.get(); updateCookieStatus(); toast(`已保存 ${r.count} 条 Cookies`, 'success'); }
});
$$('[data-import]').forEach(b => b.onclick = async () => {
  const browser = b.dataset.import;
  b.disabled = true;
  try {
    let r;
    try { r = await api.cookies.import(browser, false); }
    catch (e) {
      if (!String(e.message).includes('RUNNING')) throw e;
      const ok = await confirmDialog('暂时关闭浏览器', `${browser} 正在运行。读取 Cookies 需暂时关闭它，完成后自动重新打开。是否继续？`, '继续');
      if (!ok) return;
      r = await api.cookies.import(browser, true);
    }
    settings = await api.settings.get();
    updateCookieStatus();
    toast(`已导入 ${r.count} 条 Cookies`, 'success');
  } catch (e) { toast('导入失败：' + e.message, 'error'); }
  finally { b.disabled = false; }
});
$('#btn-cookies-clear').onclick = async () => {
  await api.cookies.clear();
  settings = await api.settings.get();
  updateCookieStatus();
  toast('Cookies 已清除');
};
api.cookies.onSaved(d => { settings.cookieFile = d.file; updateCookieStatus(); });

/* ── 本地工具：拖放 / 转换 / 分离 / 水印 ── */
function setupDropzone(el, onFile) {
  el.addEventListener('click', async () => { const f = await api.dialog.file(); if (f) onFile(f); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) { const p = api.filePath(f); if (p) onFile(p); }
  });
}
const baseName = p => p.split(/[\\/]/).pop();
function fileCardHTML(name, probe) {
  const meta = [fmtSize(probe.size), probe.duration ? fmtTime(probe.duration) : null,
    probe.width ? `${probe.width}×${probe.height}` : null, probe.vcodec, probe.acodec].filter(Boolean).join(' ｜ ');
  return `<div><div class="fc-name">${esc(name)}</div><div class="fc-meta">${esc(meta)}</div></div>`;
}

const convertState = { file: null, probe: null, format: 'mp4' };
const FORMATS = [
  { id: 'mp4', audio: false }, { id: 'mkv', audio: false }, { id: 'webm', audio: false },
  { id: 'mov', audio: false }, { id: 'gif', audio: false },
  { id: 'mp3', audio: true }, { id: 'wav', audio: true }, { id: 'aac', audio: true },
  { id: 'flac', audio: true }, { id: 'm4a', audio: true },
  { id: 'aiff', audio: true }, { id: 'alac', audio: true }
];
const LOSSLESS = ['flac', 'wav', 'aiff', 'alac'];
FORMATS.forEach(f => {
  const b = document.createElement('button');
  b.className = 'fmt-btn' + (f.id === 'mp4' ? ' active' : '');
  b.textContent = f.id.toUpperCase();
  b.onclick = () => {
    convertState.format = f.id;
    $$('#convert-formats .fmt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('#convert-video-opts').classList.toggle('hidden', f.audio || f.id === 'gif');
    $('#convert-audio-opts').classList.toggle('hidden', f.id === 'gif' || f.id === 'wav' || f.id === 'flac' || LOSSLESS.includes(f.id));
    $('#convert-lossless-opts').classList.toggle('hidden', !LOSSLESS.includes(f.id));
  };
  $('#convert-formats').appendChild(b);
});
$('#convert-crf').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  $('#crf-label').textContent = `${v <= 19 ? '极高' : v <= 23 ? '高' : v <= 27 ? '中' : '低'} (CRF ${v})`;
});
setupDropzone($('#dz-convert'), async file => {
  try {
    const probe = await api.media.probe(file);
    convertState.file = file; convertState.probe = probe;
    $('#convert-file').innerHTML = fileCardHTML(baseName(file), probe);
    $('#dz-convert').classList.add('hidden');
    $('#convert-panel').classList.remove('hidden');
  } catch (e) { errorDialog('无法读取文件', e.message); }
});
$('#btn-convert-reset').onclick = () => { convertState.file = null; $('#convert-panel').classList.add('hidden'); $('#dz-convert').classList.remove('hidden'); };
$('#btn-convert').onclick = async () => {
  if (!convertState.file) return;
  try {
    await api.convert({
      file: convertState.file, format: convertState.format,
      resolution: $('#convert-res').value, crf: parseInt($('#convert-crf').value),
      audioKbps: parseInt($('#convert-abr').value), duration: convertState.probe?.duration,
      fps: convertState.probe?.fps, hasAudio: !!convertState.probe?.acodec,
      vindex: convertState.probe?.vindex, aindex: convertState.probe?.aindex,
      sampleRate: $('#convert-rate').value, bitDepth: $('#convert-depth').value
    });
    toast('已加入转换队列', 'success');
  } catch (e) { errorDialog('启动转换失败', e.message); }
};

const extractState = { file: null, probe: null, mode: 'audio' };
$$('#extract-modes .mode-card').forEach(b => b.onclick = () => {
  extractState.mode = b.dataset.mode;
  $$('#extract-modes .mode-card').forEach(x => x.classList.toggle('active', x === b));
  $('#extract-audio-row').classList.toggle('hidden', extractState.mode === 'video');
});
setupDropzone($('#dz-extract'), async file => {
  try {
    const probe = await api.media.probe(file);
    extractState.file = file; extractState.probe = probe;
    $('#extract-file').innerHTML = fileCardHTML(baseName(file), probe);
    $('#dz-extract').classList.add('hidden');
    $('#extract-panel').classList.remove('hidden');
  } catch (e) { errorDialog('无法读取文件', e.message); }
});
$('#btn-extract-reset').onclick = () => { extractState.file = null; $('#extract-panel').classList.add('hidden'); $('#dz-extract').classList.remove('hidden'); };
$('#btn-extract').onclick = async () => {
  if (!extractState.file) return;
  try {
    await api.extract({ file: extractState.file, mode: extractState.mode, audioFormat: $('#extract-fmt').value, duration: extractState.probe?.duration, fps: extractState.probe?.fps, hasAudio: !!extractState.probe?.acodec, vindex: extractState.probe?.vindex, aindex: extractState.probe?.aindex });
    toast('已加入提取队列', 'success');
  } catch (e) { errorDialog('启动提取失败', e.message); }
};

const wm = { file: null, probe: null, mode: 'delogo', regions: [], nextId: 1, drawing: null, scale: 1, frameReq: 0 };
const wmImg = $('#wm-frame');
const wmCanvas = $('#wm-canvas');
const wmCtx = wmCanvas.getContext('2d');
$$('#wm-modes .seg-btn').forEach(b => b.onclick = () => {
  wm.mode = b.dataset.mode;
  $$('#wm-modes .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  wm.regions = [];
  $('#wm-hint').textContent = wm.mode === 'crop' ? '框选要保留的画面区域' : '在画面上按住拖动框选水印区域（可多个）';
  renderRegions(); drawOverlay();
});
$('#btn-wm-clear').onclick = () => { wm.regions = []; renderRegions(); drawOverlay(); };
setupDropzone($('#dz-watermark'), async file => {
  try {
    const probe = await api.media.probe(file);
    if (!probe.width) return errorDialog('无法处理', '该文件没有视频画面。');
    wm.file = file; wm.probe = probe; wm.regions = [];
    $('#wm-time').max = String(Math.max(0.1, probe.duration - 0.1));
    $('#wm-time').value = '0';
    $('#wm-time-label').textContent = '00:00';
    $('#wm-duration-label').textContent = fmtTime(probe.duration);
    $('#dz-watermark').classList.add('hidden');
    $('#watermark-panel').classList.remove('hidden');
    renderRegions();
    loadFrame(0);
  } catch (e) { errorDialog('无法读取文件', e.message); }
});
$('#btn-wm-reset').onclick = () => { wm.file = null; $('#watermark-panel').classList.add('hidden'); $('#dz-watermark').classList.remove('hidden'); };
let frameTimer = null;
$('#wm-time').addEventListener('input', e => {
  const t = parseFloat(e.target.value);
  $('#wm-time-label').textContent = fmtTime(t);
  clearTimeout(frameTimer);
  frameTimer = setTimeout(() => loadFrame(t), 350);
});
async function loadFrame(t) {
  if (!wm.file) return;
  const req = ++wm.frameReq;
  $('#wm-frame-loading').classList.remove('hidden');
  try {
    const data = await api.media.frame(wm.file, t);
    if (req !== wm.frameReq) return;
    $('#wm-time').value = String(t);
    $('#wm-time-label').textContent = fmtTime(t);
    wmImg.onload = () => { sizeCanvas(); drawOverlay(); };
    wmImg.src = data;
    if (wmImg.complete) { sizeCanvas(); drawOverlay(); }
  } catch (e) { toast('抽取预览帧失败：' + e.message, 'error'); }
  finally { if (req === wm.frameReq) $('#wm-frame-loading').classList.add('hidden'); }
}
function sizeCanvas() {
  const r = wmImg.getBoundingClientRect();
  const wrap = $('#wm-preview').getBoundingClientRect();
  wmCanvas.width = r.width; wmCanvas.height = r.height;
  wmCanvas.style.left = (r.left - wrap.left) + 'px';
  wmCanvas.style.top = (r.top - wrap.top) + 'px';
  wm.scale = wm.probe && r.width ? wm.probe.width / r.width : 1;
}
window.addEventListener('resize', () => { if (wm.file) { sizeCanvas(); drawOverlay(); } });
function drawOverlay() {
  wmCtx.clearRect(0, 0, wmCanvas.width, wmCanvas.height);
  const s = 1 / wm.scale;
  const draw = (r, active) => {
    const x = r.x * s, y = r.y * s, w = r.w * s, h = r.h * s;
    wmCtx.fillStyle = wm.mode === 'crop' ? 'rgba(62,143,111,0.15)' : 'rgba(181,131,42,0.18)';
    wmCtx.strokeStyle = wm.mode === 'crop' ? '#3E8F6F' : '#B5832A';
    wmCtx.lineWidth = active ? 2 : 1.5;
    wmCtx.setLineDash(active ? [5, 4] : []);
    wmCtx.fillRect(x, y, w, h);
    wmCtx.strokeRect(x, y, w, h);
    wmCtx.setLineDash([]);
  };
  wm.regions.forEach(r => draw(r, false));
  if (wm.drawing) draw(wm.drawing, true);
}
function canvasPos(e) {
  const r = wmCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * wm.scale, y: (e.clientY - r.top) * wm.scale };
}
wmCanvas.addEventListener('pointerdown', e => {
  if (!wm.file) return;
  e.preventDefault();
  wmCanvas.setPointerCapture(e.pointerId);
  const p = canvasPos(e);
  wm.drawing = { x: p.x, y: p.y, w: 0, h: 0, _ox: p.x, _oy: p.y };
});
wmCanvas.addEventListener('pointermove', e => {
  if (!wm.drawing) return;
  const p = canvasPos(e);
  const d = wm.drawing;
  d.x = Math.min(d._ox, p.x); d.y = Math.min(d._oy, p.y);
  d.w = Math.abs(p.x - d._ox); d.h = Math.abs(p.y - d._oy);
  drawOverlay();
});
wmCanvas.addEventListener('pointerup', () => {
  if (!wm.drawing) return;
  const d = wm.drawing;
  wm.drawing = null;
  if (d.w >= 8 && d.h >= 8) {
    const region = { id: wm.nextId++, x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h) };
    if (wm.mode === 'crop') wm.regions = [region]; else wm.regions.push(region);
    renderRegions();
  }
  drawOverlay();
});
function renderRegions() {
  const box = $('#wm-regions');
  box.innerHTML = '';
  wm.regions.forEach(r => {
    const chip = document.createElement('span');
    chip.className = 'region-chip';
    chip.innerHTML = `${wm.mode === 'crop' ? '保留' : '区域'} ${r.w}×${r.h} @ (${r.x}, ${r.y}) <button aria-label="删除该区域">✕</button>`;
    chip.querySelector('button').onclick = () => { wm.regions = wm.regions.filter(x => x.id !== r.id); renderRegions(); drawOverlay(); };
    box.appendChild(chip);
  });
  $('#btn-watermark').disabled = wm.regions.length === 0;
}
$('#btn-watermark').onclick = async () => {
  if (!wm.file || !wm.regions.length) return;
  try {
    await api.watermark({
      file: wm.file, mode: wm.mode,
      regions: wm.regions.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
      keep: wm.regions[0], width: wm.probe.width, height: wm.probe.height, duration: wm.probe.duration,
      fps: wm.probe.fps, hasAudio: !!wm.probe.acodec, vindex: wm.probe.vindex, aindex: wm.probe.aindex
    });
    toast('已加入处理队列', 'success');
  } catch (e) { errorDialog('启动处理失败', e.message); }
};

/* ── 字幕添加 ── */
const subState = { file: null, probe: null, entries: [], format: null, mode: 'mux' };
setupDropzone($('#dz-subtitle'), async file => {
  try {
    const probe = await api.media.probe(file);
    if (!probe.acodec) return errorDialog('无法识别', '该文件没有音轨，无法语音识别；可导入外部字幕。');
    subState.file = file; subState.probe = probe; subState.entries = []; subState.format = null;
    $('#subtitle-file').innerHTML = fileCardHTML(baseName(file), probe);
    $('#dz-subtitle').classList.add('hidden');
    $('#subtitle-panel').classList.remove('hidden');
    renderSubList();
  } catch (e) { errorDialog('无法读取文件', e.message); }
});
$('#btn-sub-reset').onclick = () => {
  subState.file = null; subState.entries = [];
  $('#subtitle-panel').classList.add('hidden');
  $('#dz-subtitle').classList.remove('hidden');
};
$$('#sub-source .seg-btn').forEach(b => b.onclick = () => {
  $$('#sub-source .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $('#sub-asr-opts').classList.toggle('hidden', b.dataset.src !== 'asr');
  $('#sub-import-opts').classList.toggle('hidden', b.dataset.src !== 'import');
  $('#sub-online-opts').classList.toggle('hidden', b.dataset.src !== 'online');
  $('#sub-url-opts').classList.toggle('hidden', b.dataset.src !== 'online');
  if (b.dataset.src === 'online' && !$('#sub-query').value && subState.file) {
    $('#sub-query').value = baseName(subState.file).replace(/\.[^.]+$/, '').replace(/[._]/g, ' ').replace(/\[.*?\]/g, '').trim();
  }
});
$('#btn-sub-url').onclick = async () => {
  const url = $('#sub-url').value.trim();
  if (!/^https?:\/\//i.test(url)) return toast('请输入 http(s) 字幕直链', 'error');
  try {
    const loaded = await api.subtitle.fetch(url);
    subState.entries = loaded.entries; subState.format = loaded.format;
    renderSubList();
    toast(`已套用字幕：${loaded.entries.length} 条（${loaded.format.toUpperCase()}）`, 'success');
  } catch (e) { errorDialog('字幕下载失败', e.message); }
};
$('#btn-sub-search').onclick = async () => {
  const query = $('#sub-query').value.trim();
  if (!query && !subState.file) return toast('请输入片名或先选择视频文件', 'error');
  const btn = $('#btn-sub-search');
  btn.disabled = true;
  toast('正在搜索在线字幕（首次需通过站点验证，约数秒）');
  try {
    const results = await api.subtitle.search({
      query, year: $('#sub-year').value.trim(),
      lang: $('#sub-online-lang').value, file: subState.file
    });
    const box = $('#sub-online-results');
    box.classList.remove('hidden');
    if (!results.length) {
      box.innerHTML = '<div class="sub-result"><span class="nm">未找到匹配字幕，可换片名/语言或改用语音识别</span></div>';
    } else {
      box.innerHTML = results.map((r, i) => `
        <div class="sub-result" data-i="${i}" title="${esc(r.name)}">
          <span class="nm">${esc(r.name)}</span>
          <span>${esc(r.lang)}</span>
          <span>${esc(r.format)}</span>
          <span>${r.downloads} 次下载</span>
          <span class="mt">${esc(r.matched)}</span>
        </div>`).join('');
      box.onclick = async e => {
        const row = e.target.closest('.sub-result');
        if (!row || row.dataset.i === undefined) return;
        const r = results[parseInt(row.dataset.i)];
        toast('正在下载字幕：' + r.name);
        try {
          const loaded = await api.subtitle.fetch(r.url);
          subState.entries = loaded.entries; subState.format = loaded.format;
          renderSubList();
          toast(`已套用在线字幕：${loaded.entries.length} 条（${loaded.format.toUpperCase()}），可编辑后输出`, 'success');
        } catch (err) { errorDialog('字幕下载失败', err.message); }
      };
    }
    toast(`搜索到 ${results.length} 条字幕`, 'success');
  } catch (e) { errorDialog('在线搜索失败', e.message); }
  finally { btn.disabled = false; }
};
$$('#sub-mode .seg-btn').forEach(b => b.onclick = () => {
  subState.mode = b.dataset.mode;
  $$('#sub-mode .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $('#sub-mux-opts').classList.toggle('hidden', subState.mode !== 'mux');
  $('#sub-burn-opts').classList.toggle('hidden', subState.mode !== 'burn');
});
$('#btn-asr').onclick = async () => {
  if (!subState.file) return;
  try {
    await api.subtitle.asr({
      file: subState.file, model: $('#sub-model').value,
      language: $('#sub-lang').value, device: $('#sub-device').value,
      duration: subState.probe.duration
    });
    toast('已加入识别队列', 'success');
    gotoPage('tasks');
  } catch (e) { errorDialog('启动识别失败', e.message); }
};
$('#btn-sub-import').onclick = async () => {
  const f = await api.dialog.file([{ name: '字幕文件', extensions: ['srt', 'vtt', 'ass'] }]);
  if (!f) return;
  try {
    const r = await api.subtitle.load(f);
    subState.entries = r.entries; subState.format = r.format;
    renderSubList();
    toast(`已导入 ${r.entries.length} 条字幕（${r.format.toUpperCase()}）`, 'success');
  } catch (e) { errorDialog('导入失败', e.message); }
};
function renderSubList() {
  const list = $('#sub-list');
  list.innerHTML = subState.entries.map((e, i) => `
    <div class="sub-row">
      <span class="idx">${i + 1}</span>
      <span class="tm">${fmtTime(e.start)} → ${fmtTime(e.end)}</span>
      <input type="text" data-i="${i}" value="${esc(e.text)}" aria-label="第 ${i + 1} 条字幕文本">
    </div>`).join('');
  $('#sub-count').textContent = subState.entries.length ? `${subState.entries.length} 条` : '（暂无字幕，先识别或导入）';
  $('#btn-sub-apply').disabled = subState.entries.length === 0;
}
$('#sub-list').addEventListener('input', e => {
  const i = parseInt(e.target.dataset.i);
  if (!isNaN(i)) subState.entries[i].text = e.target.value;
});
$('#btn-sub-offset').onclick = () => {
  const off = parseFloat($('#sub-offset').value);
  if (isNaN(off)) return toast('偏移量无效', 'error');
  subState.entries.forEach(e => { e.start = Math.max(0, e.start + off); e.end = Math.max(0.1, e.end + off); });
  renderSubList();
  toast(`已偏移 ${off}s`);
};
$('#btn-sub-apply').onclick = async () => {
  if (!subState.file || !subState.entries.length) return;
  try {
    await api.subtitle.apply({
      file: subState.file, entries: subState.entries, mode: subState.mode,
      container: $('#sub-container').value,
      style: { fontSize: parseInt($('#sub-fontsize').value) || 22, color: $('#sub-color').value, marginV: parseInt($('#sub-margin').value) || 30 },
      duration: subState.probe.duration, vindex: subState.probe.vindex, aindex: subState.probe.aindex,
      fps: subState.probe.fps, hasAudio: !!subState.probe.acodec
    });
    toast('已加入字幕任务队列', 'success');
    gotoPage('tasks');
  } catch (e) { errorDialog('启动字幕任务失败', e.message); }
};

/* ── 音乐解密 ── */
const MUSIC_EXT = ['ncm', 'qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcra', 'mflac', 'mgg', 'mflac0', 'mgg0', 'mogg', 'kgm', 'vpr', 'kgma', 'kwm', 'xm', 'mg3d', 'bkcmp3', 'bkcflac'];
const musicState = { files: [] };
function renderMusicList() {
  $('#music-count').textContent = musicState.files.length ? `${musicState.files.length} 个文件` : '';
  $('#music-list').innerHTML = musicState.files.map((f, i) => `
    <div class="sub-row">
      <span class="idx">${i + 1}</span>
      <span class="tm">${esc(f.split(/[\\/]/).pop().split('.').pop().toUpperCase())}</span>
      <span class="nm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f)}">${esc(baseName(f))}</span>
    </div>`).join('');
  $('#music-panel').classList.toggle('hidden', musicState.files.length === 0);
  $('#dz-music').classList.toggle('hidden', musicState.files.length > 0);
}
async function addMusicFiles() {
  const fs2 = await api.dialog.files([{ name: '加密音乐文件', extensions: MUSIC_EXT }]);
  if (fs2 && fs2.length) {
    for (const f of fs2) if (!musicState.files.includes(f)) musicState.files.push(f);
    renderMusicList();
  }
}
setupDropzone($('#dz-music'), async () => { await addMusicFiles(); });
$('#dz-music').addEventListener('drop', e => {
  const files = [...e.dataTransfer.files].map(f => api.filePath(f)).filter(p => p && MUSIC_EXT.includes(p.split('.').pop().toLowerCase()));
  if (files.length) {
    for (const f of files) if (!musicState.files.includes(f)) musicState.files.push(f);
    renderMusicList();
  }
}, true);
$('#btn-music-add').onclick = addMusicFiles;
$('#btn-music-clear').onclick = () => { musicState.files = []; renderMusicList(); };
$('#btn-music-decrypt').onclick = async () => {
  if (!musicState.files.length) return;
  try {
    await api.music.decrypt({ files: musicState.files });
    toast(`已加入 ${musicState.files.length} 个解密任务`, 'success');
    musicState.files = [];
    renderMusicList();
    gotoPage('tasks');
  } catch (e) { errorDialog('启动解密失败', e.message); }
};

/* ── 歌词烧录 ── */
const lyrState = { files: [] };
const AUDIO_EXT = ['mp3', 'flac', 'm4a', 'wav', 'aiff', 'ogg', 'opus'];
function renderLyricsFiles() {
  $('#lyrics-count').textContent = lyrState.files.length ? `${lyrState.files.length} 个文件` : '';
  $('#lyrics-files').innerHTML = lyrState.files.map((f, i) => `
    <div class="sub-row">
      <span class="idx">${i + 1}</span>
      <span class="tm">${esc(f.split('.').pop().toUpperCase())}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f)}">${esc(baseName(f))}</span>
    </div>`).join('');
  $('#lyrics-panel').classList.toggle('hidden', lyrState.files.length === 0);
  $('#dz-lyrics').classList.toggle('hidden', lyrState.files.length > 0);
  updateLyrBurnBtn();
}
function updateLyrBurnBtn() {
  $('#btn-lyr-burn').disabled = !(lyrState.files.length && $('#lyr-text').value.trim());
}
async function addLyricsFiles() {
  const fs2 = await api.dialog.files([{ name: '音乐文件', extensions: AUDIO_EXT }]);
  if (fs2 && fs2.length) {
    for (const f of fs2) if (!lyrState.files.includes(f)) lyrState.files.push(f);
    renderLyricsFiles();
    if (!$('#lyr-query').value && lyrState.files.length) {
      $('#lyr-query').value = baseName(lyrState.files[0]).replace(/\.[^.]+$/, '').replace(/[._]/g, ' ').trim();
    }
  }
}
setupDropzone($('#dz-lyrics'), async () => { await addLyricsFiles(); });
$('#btn-lyr-add').onclick = addLyricsFiles;
$('#btn-lyr-clear').onclick = () => { lyrState.files = []; renderLyricsFiles(); };
$$('#lyr-source .seg-btn').forEach(b => b.onclick = () => {
  $$('#lyr-source .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $('#lyr-online-opts').classList.toggle('hidden', b.dataset.src !== 'online');
  $('#lyr-local-opts').classList.toggle('hidden', b.dataset.src !== 'local');
  $('#lyr-results').classList.toggle('hidden', b.dataset.src !== 'online');
});
$('#btn-lyr-search').onclick = async () => {
  const q = $('#lyr-query').value.trim();
  if (!q) return toast('请输入歌名或歌手', 'error');
  try {
    const songs = await api.lyrics.search(q);
    const box = $('#lyr-results');
    box.classList.remove('hidden');
    if (!songs.length) { box.innerHTML = '<div class="sub-result"><span class="nm">未找到歌曲</span></div>'; return; }
    box.innerHTML = songs.map((s, i) => `
      <div class="sub-result" data-i="${i}">
        <span class="nm">${esc(s.name)}</span>
        <span style="grid-column: span 3">${esc(s.artist)}${s.album ? ' · ' + esc(s.album) : ''}</span>
        <span class="mt">选用</span>
      </div>`).join('');
    box.onclick = async e => {
      const row = e.target.closest('.sub-result');
      if (!row || row.dataset.i === undefined) return;
      try {
        const lrc = await api.lyrics.fetch(songs[parseInt(row.dataset.i)].id);
        $('#lyr-text').value = lrc;
        updateLyrBurnBtn();
        toast('歌词已加载，可编辑后烧录', 'success');
      } catch (err) { errorDialog('歌词获取失败', err.message); }
    };
  } catch (e) { errorDialog('搜索失败', e.message); }
};
$('#btn-lyr-local').onclick = async () => {
  const f = await api.dialog.file([{ name: '歌词文件', extensions: ['lrc', 'txt'] }]);
  if (!f) return;
  try {
    $('#lyr-text').value = await api.fs.readText(f);
    updateLyrBurnBtn();
  } catch (e) { errorDialog('读取失败', e.message); }
};
$('#lyr-text').addEventListener('input', updateLyrBurnBtn);
$('#btn-lyr-burn').onclick = async () => {
  const text = $('#lyr-text').value.trim();
  if (!lyrState.files.length || !text) return;
  try {
    await api.lyrics.burn({ files: lyrState.files, text, synced: $('#lyr-synced').checked });
    toast(`已加入 ${lyrState.files.length} 个歌词烧录任务`, 'success');
    gotoPage('tasks');
  } catch (e) { errorDialog('启动烧录失败', e.message); }
};

/* ── 实时登录状态 ── */
const LS_TEXT = { logged: '已登录', expired: '已过期', none: '未登录' };
function renderLoginStatus(s) {
  const box = $('#login-status');
  if (!box) return;
  if (!s || !s.configured) {
    box.innerHTML = '<span class="ls-chip none"><span class="dot"></span>未配置 Cookies</span>';
    return;
  }
  box.innerHTML = s.platforms.map(p => {
    const exp = p.expires ? new Date(p.expires * 1000).toLocaleDateString() : '';
    return `<span class="ls-chip ${p.state}" title="${p.name} ${LS_TEXT[p.state]}${exp ? ' · 有效期至 ' + exp : ''}">
      <span class="dot"></span>${esc(p.name)} · ${LS_TEXT[p.state]}${p.state === 'logged' && exp ? `<small>${exp}</small>` : ''}
    </span>`;
  }).join('');
}
async function refreshLoginStatus() {
  try { renderLoginStatus(await api.cookies.status()); } catch {}
}
api.cookies.onChanged(s => renderLoginStatus(s));
setInterval(refreshLoginStatus, 5000);

/* ── 初始化 ── */
(async function init() {
  await initSettings();
  const list = await api.tasks.list();
  list.forEach(t => { tasks.set(t.id, t); prevStatus.set(t.id, t.status); });
  renderTasks();
  const t = await api.env.check();
  const allOk = t.ffmpeg && t.ffprobe && t.ytdlp && t.dirWritable;
  if (allOk) {
    startupEnvCheck().then(() => {});
    setTimeout(closeDialog, 1600);
  } else {
    startupEnvCheck();
  }
})();