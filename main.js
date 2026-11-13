const { app, BrowserWindow, ipcMain, dialog, shell, session, Tray, Menu, nativeImage, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile, spawnSync } = require('child_process');
const tools = require('./src/tools');
const music = require('./src/music-crypto');
const lyrics = require('./src/lyrics');
const { TaskManager } = require('./src/tasks');

if (process.argv.includes('--dev-instance')) {
  app.setPath('userData', path.join(app.getPath('appData'), 'VideoKit-dev'));
}

let win = null;
let tray = null;
let settings;
let tasks;
let quitting = false;
let boundsTimer = null;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const logFile = () => path.join(app.getPath('userData'), 'videokit.log');
const helperPath = name => app.isPackaged
  ? path.join(process.resourcesPath, name)
  : path.join(__dirname, 'src', name);

function log(line) {
  if (!settings || !settings.logEnabled) return;
  try { fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${line}\n`); } catch {}
}

function loadSettings() {
  const defaults = {
    downloadDir: path.join(app.getPath('videos'), 'VideoKit'),
    ffmpegPath: '', ytdlpPath: '',
    maxConcurrent: 4, downloadThreads: 16,
    cookieFile: '',
    speedLimit: 0, wiredOnly: false,
    codecPref: 'auto', defaultQuality: 'best', autoSubs: false,
    mergeAV: true, downloadSubs: false,
    theme: 'system', startupSize: 'default', minimizeToTray: true,
    proxy: '', logEnabled: false, verifyOutput: true,
    encoder: 'auto', pythonPath: '',
    osUser: '', osPass: '',
    bounds: null
  };
  try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { settings = defaults; }
  if (!fs.existsSync(settings.downloadDir)) fs.mkdirSync(settings.downloadDir, { recursive: true });
}

function saveSettings() {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

function createWindow() {
  const opts = {
    width: 1280, height: 800, minWidth: 860, minHeight: 560,
    frame: false, backgroundColor: '#1E2320', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  };
  if (settings.startupSize === 'last' && settings.bounds) Object.assign(opts, settings.bounds);
  win = new BrowserWindow(opts);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (settings.startupSize === 'max') win.maximize();
  });
  const persistBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) {
        settings.bounds = win.getBounds();
        saveSettings();
      }
    }, 600);
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);
  win.on('maximize', () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));
  win.on('close', e => {
    if (!quitting && settings.minimizeToTray && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
}

function send(channel, payload) {
  if (channel === 'task:update' && payload) {
    try { fs.appendFileSync(logFile(), `[${new Date().toISOString()}] task#${payload.id} ${payload.type} ${payload.status} ${Math.round(payload.progress)}% ${payload.phase || ''}\n`); } catch {}
    if (payload.status === 'error') {
      try { fs.appendFileSync(logFile(), `[${new Date().toISOString()}] task#${payload.id} ERROR ${payload.error}\n`); } catch {}
    }
  }
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function uniqueOut(dir, base, ext) {
  const taken = new Set(tasks ? tasks.list().map(t => t.outputPath) : []);
  let p = path.join(dir, `${base}.${ext}`);
  let i = 1;
  while (fs.existsSync(p) || taken.has(p)) p = path.join(dir, `${base} (${i++}).${ext}`);
  return p;
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
}

function cookieArgs() {
  return settings.cookieFile && fs.existsSync(settings.cookieFile) ? ['--cookies', settings.cookieFile] : [];
}

function netArgs() {
  const a = [];
  if (settings.speedLimit > 0) a.push('--limit-rate', `${settings.speedLimit}K`);
  if (settings.proxy) a.push('--proxy', settings.proxy);
  return a;
}

let wiredCache = { at: 0, wired: true };
function checkWired() {
  if (!settings.wiredOnly) return;
  if (Date.now() - wiredCache.at < 30000) {
    if (!wiredCache.wired) throw new Error('已启用「仅在有线网络下载」，当前为无线网络');
    return;
  }
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "(Get-NetAdapter | Where-Object Status -eq Up | Select-Object -ExpandProperty PhysicalMediaType) -join ','"],
    { windowsHide: true, encoding: 'utf8', timeout: 8000 });
  const media = (r.stdout || '').trim();
  const hasWired = /802\.3|Ethernet/i.test(media);
  const hasWifi = /802\.11|Wireless|Wi-Fi/i.test(media);
  wiredCache = { at: Date.now(), wired: hasWired || !hasWifi };
  if (!wiredCache.wired) throw new Error('已启用「仅在有线网络下载」，当前为无线网络');
}

function mergeCookies(cookies) {
  const file = path.join(app.getPath('userData'), 'cookies.txt');
  const map = new Map();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const p = line.split('\t');
      if (p.length >= 7) map.set(p.slice(0, 3).join('|') + '|' + p[5], line);
    }
  }
  for (const c of cookies) {
    const domain = c.domain || '';
    const row = [domain, domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/',
      c.secure ? 'TRUE' : 'FALSE', String(Math.round(c.expirationDate || 0)), c.name, c.value].join('\t');
    map.set([domain, c.path || '/', c.name].join('|'), row);
  }
  fs.writeFileSync(file, '# Netscape HTTP Cookie File\n' + [...map.values()].join('\n') + '\n');
  settings.cookieFile = file;
  saveSettings();
  watchCookies();
  send('cookies:changed', cookieStatus());
  return file;
}

const BROWSER_DEFS = {
  chrome: {
    exes: [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')],
    data: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')
  },
  edge: {
    exes: [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    data: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data')
  }
};

function browserRunning(imageName) {
  const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH'], { windowsHide: true, encoding: 'utf8' });
  return (r.stdout || '').toLowerCase().includes(imageName.toLowerCase());
}

async function importCookies(browser, force) {
  const def = BROWSER_DEFS[browser];
  if (!def) throw new Error('未知浏览器');
  const exe = def.exes.find(p => p && fs.existsSync(p));
  if (!exe) throw new Error(`未找到 ${browser} 安装`);
  if (!fs.existsSync(def.data)) throw new Error(`未找到 ${browser} 用户数据目录`);
  const imageName = browser === 'chrome' ? 'chrome.exe' : 'msedge.exe';
  const wasRunning = browserRunning(imageName);
  if (wasRunning && !force) throw new Error('RUNNING');
  if (wasRunning) {
    spawnSync('taskkill', ['/IM', imageName, '/F'], { windowsHide: true });
    for (let i = 0; i < 30 && browserRunning(imageName); i++) await new Promise(r => setTimeout(r, 500));
  }
  let proc = null;
  try {
    const port = 9333 + Math.floor(Math.random() * 200);
    proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', `--remote-debugging-port=${port}`, 'about:blank'], { windowsHide: true });
    const helper = spawn(process.execPath, ['--experimental-websocket', helperPath('cookie-helper.js'), String(port)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true
    });
    let out = '', err = '';
    helper.stdout.on('data', d => (out += d));
    helper.stderr.on('data', d => (err += d));
    const code = await new Promise(res => helper.on('close', res));
    if (code !== 0) throw new Error(err.trim() || 'Cookies 读取失败');
    const cookies = JSON.parse(out).map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, expirationDate: c.expires > 0 ? c.expires : 0
    }));
    if (!cookies.length) throw new Error('未读取到任何 Cookies');
    return { count: cookies.length, file: mergeCookies(cookies) };
  } finally {
    if (proc) execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
    if (wasRunning) { const rel = spawn(exe, [], { detached: true, stdio: 'ignore' }); rel.unref(); }
  }
}

/* ── 本地库 ── */
const MEDIA_EXT = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'ts', 'm4v', 'wmv', 'mp3', 'm4a', 'wav', 'flac', 'aac'];
const probeCache = new Map();
const thumbDir = () => path.join(app.getPath('userData'), 'thumbs');

function libraryList() {
  const dir = settings.downloadDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => MEDIA_EXT.includes(path.extname(f).slice(1).toLowerCase()))
    .map(f => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { path: p, name: f, ext: path.extname(f).slice(1).toLowerCase(), size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 300);
}

async function libraryInfo(file) {
  const st = fs.statSync(file);
  const hit = probeCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.info;
  const info = await tools.probe(settings, file);
  probeCache.set(file, { mtime: st.mtimeMs, info });
  return info;
}

async function libraryThumb(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(ext)) return null;
  fs.mkdirSync(thumbDir(), { recursive: true });
  const key = Buffer.from(file).toString('base64url').slice(0, 64) + '-' + Math.round(fs.statSync(file).mtimeMs);
  const out = path.join(thumbDir(), key + '.jpg');
  if (!fs.existsSync(out)) {
    await tools.runFfmpeg(settings, ['-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', '-y', out]);
  }
  return 'data:image/jpeg;base64,' + fs.readFileSync(out).toString('base64');
}

/* ── 托盘 ─ */
function buildTray(icon) {
  if (tray) { tray.setImage(icon); return; }
  tray = new Tray(icon);
  tray.setToolTip('VideoKit — 视频下载');
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: '全部暂停', click: () => tasks.pauseAll() },
    { label: '全部继续', click: () => tasks.resumeAll() },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; tasks.killAll(); app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { win.show(); win.focus(); });
}

function taskContextMenu(id, x, y) {
  const t = tasks.get(id);
  if (!t) return;
  const items = [];
  if (t.status === 'running' || t.status === 'queued') items.push({ label: '暂停', enabled: t.type === 'download', click: () => tasks.pause(id) });
  if (t.status === 'paused') items.push({ label: '继续', click: () => tasks.resume(id) });
  if (t.status === 'error' || t.status === 'cancelled') items.push({ label: '重试', click: () => tasks.retry(id) });
  items.push({ label: '打开目录', enabled: !!t.outputPath, click: () => shell.showItemInFolder(t.outputPath) });
  items.push({ label: '复制保存路径', enabled: !!t.outputPath, click: () => clipboard.writeText(t.outputPath) });
  if (t.info && t.info.webpage) items.push({ label: '复制视频链接', click: () => clipboard.writeText(t.info.webpage) });
  if (t.info) items.push({ label: '选择清晰度重新下载…', click: () => send('dialog:quality', id) });
  items.push({ type: 'separator' });
  items.push({ label: '删除任务', click: () => send('dialog:delete-task', id) });
  Menu.buildFromTemplate(items).popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

function videoEncodeArgs(crf, useGpu) {
  if (useGpu) return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf), '-b:v', '0', '-pix_fmt', 'yuv420p'];
  return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
}

async function wantGpu() {
  if (settings.encoder === 'cpu') return false;
  if (settings.encoder === 'gpu') return true;
  return (await tools.gpuInfo()).nvenc;
}

/* ── 字幕 ── */
const modelsDir = () => path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'VideoKit', 'models');
const subsDir = () => path.join(app.getPath('userData'), 'subtitles');

function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), mm = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(mm, 3)}`;
}
function parseSrt(text) {
  const entries = [];
  for (const b of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = b.split('\n').filter(l => l.trim());
    if (!lines.length || lines[0].startsWith('NOTE')) continue;
    let i = /^\d+$/.test(lines[0].trim()) ? 1 : 0;
    const m = lines[i] && lines[i].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!m) continue;
    const t = (a, b2, c, d) => +a * 3600 + +b2 * 60 + +c + +d / 1000;
    entries.push({ start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]), text: lines.slice(i + 1).join('\n') });
  }
  return entries;
}
function parseAss(text) {
  const entries = [];
  const at = s => { const m = s.match(/(\d+):(\d{2}):(\d{2})[.](\d{2})/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100 : 0; };
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^Dialogue:\s*([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*)$/);
    if (!m) continue;
    entries.push({ start: at(m[2]), end: at(m[3]), text: m[9].replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').trim() });
  }
  return entries;
}
function writeSrt(entries) {
  return entries.map((e, i) => `${i + 1}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${e.text}\n`).join('\n');
}
function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/* ── 在线字幕（OpenSubtitles，经后台系统 Chrome 过 CF） ── */
let subsChrome = null;
let subsPort = 0;
let subsToken = null;

function xmlEsc(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
const xmlStr = s => `<param><value><string>${xmlEsc(s)}</string></value></param>`;

function osHash(file) {
  const st = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const read = off => {
      const b = Buffer.alloc(65536);
      const n = fs.readSync(fd, b, 0, 65536, off);
      return b.subarray(0, n);
    };
    let h = BigInt(st.size);
    for (const b of [read(0), read(Math.max(0, st.size - 65536))]) {
      for (let i = 0; i + 8 <= b.length; i += 8) h += b.readBigUInt64LE(i);
    }
    return (h & 0xFFFFFFFFFFFFFFFFn).toString(16).padStart(16, '0');
  } finally { fs.closeSync(fd); }
}

async function ensureSubsChrome() {
  if (subsChrome && subsChrome.exitCode === null) return subsPort;
  const def = BROWSER_DEFS.chrome;
  const exe = def.exes.find(p => p && fs.existsSync(p)) || BROWSER_DEFS.edge.exes.find(p => p && fs.existsSync(p));
  if (!exe) throw new Error('未找到 Chrome / Edge，在线字幕需要系统浏览器');
  subsPort = 9226 + Math.floor(Math.random() * 100);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'videokit-subs-'));
  subsChrome = spawn(exe, [
    `--remote-debugging-port=${subsPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--window-position=-32000,-32000', '--window-size=900,700',
    'https://api.opensubtitles.org/xml-rpc'
  ], { windowsHide: false });
  subsChrome.on('exit', () => { fs.rm(profile, { recursive: true, force: true }, () => {}); });
  for (let i = 0; i < 30; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${subsPort}/json/version`)).json();
      return subsPort;
    } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error('后台浏览器启动失败');
}

async function subsCall(req) {
  const port = await ensureSubsChrome();
  const helper = spawn(process.execPath, ['--experimental-websocket', helperPath('subs-helper.js'), String(port), JSON.stringify(req)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true
  });
  let out = '', err = '';
  helper.stdout.on('data', d => (out += d));
  helper.stderr.on('data', d => (err += d));
  const code = await new Promise(res => helper.on('close', res));
  if (code !== 0) throw new Error(err.trim() || '字幕浏览器调用失败');
  return JSON.parse(out);
}

async function subsRpc(method, paramsXml) {
  for (let i = 0; i < 8; i++) {
    const r = await subsCall({ kind: 'rpc', method, paramsXml });
    if (!r.cf) {
      if (r.fault) throw new Error('字幕服务返回错误：' + (r.fault.faultString || JSON.stringify(r.fault)));
      return r.data;
    }
    await new Promise(res => setTimeout(res, 4000));
  }
  throw new Error('Cloudflare 验证未通过，请稍后重试');
}

async function subsLogin(force) {
  if (subsToken && !force) return subsToken;
  const d = await subsRpc('LogIn', xmlStr(settings.osUser || '') + xmlStr(settings.osPass || '') + xmlStr('zh-cn') + xmlStr('VideoKit v1.3.0'));
  subsToken = d.token;
  return subsToken;
}

function decodeSubBuffer(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = require('zlib').gunzipSync(buf);
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find(e => /\.(srt|ass|vtt|ssa)$/i.test(e.entryName)) || zip.getEntries()[0];
    if (!entry) throw new Error('压缩包内没有字幕文件');
    buf = entry.getData();
  }
  const text = buf.toString('utf8').replace(/^/, '');
  if (/VIP member|osdb\.link/i.test(text) && text.length < 400) {
    const e = new Error('OS_ANON_LIMIT');
    e.code = 'OS_ANON_LIMIT';
    throw e;
  }
  if (text.includes('[Script Info]')) return { format: 'ass', entries: parseAss(text) };
  if (text.startsWith('WEBVTT')) return { format: 'vtt', entries: parseSrt(text.replace(/^WEBVTT[^\n]*\n/, '')) };
  return { format: 'srt', entries: parseSrt(text) };
}

function cookieStatus() {
  const file = settings.cookieFile;
  const platforms = [
    { id: 'bilibili', name: 'B站', markers: ['SESSDATA'], domain: 'bilibili' },
    { id: 'youtube', name: 'YouTube', markers: ['LOGIN_INFO', 'SID'], domain: 'youtube' },
    { id: 'douyin', name: '抖音', markers: ['sessionid', 'sessionid_ss', 'passport_auth_status'], domain: 'douyin' },
    { id: 'netease', name: '网易云', markers: ['MUSIC_U'], domain: 'music.163' }
  ];
  const rows = [];
  let lines = [];
  if (file && fs.existsSync(file)) {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
  }
  const now = Date.now() / 1000;
  for (const p of platforms) {
    const hits = lines.filter(c => c.length >= 7 && c[0].includes(p.domain) && p.markers.includes(c[5]) && c[6]);
    if (!hits.length) { rows.push({ id: p.id, name: p.name, state: 'none', expires: null }); continue; }
    const exps = hits.map(c => parseInt(c[4], 10)).filter(e => e > 0);
    const exp = exps.length ? Math.min(...exps) : null;
    const expired = exp !== null && exp < now;
    rows.push({ id: p.id, name: p.name, state: expired ? 'expired' : 'logged', expires: exp });
  }
  return { configured: !!(file && fs.existsSync(file)), platforms: rows };
}

let cookieWatcher = null;
function watchCookies() {
  if (cookieWatcher) { cookieWatcher.close(); cookieWatcher = null; }
  const file = settings.cookieFile;
  if (!file || !fs.existsSync(file)) return;
  let timer = null;
  try {
    cookieWatcher = fs.watch(file, () => {
      clearTimeout(timer);
      timer = setTimeout(() => send('cookies:changed', cookieStatus()), 500);
    });
  } catch {}
}

function registerIpc() {
  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('win:close', () => win.close());
  ipcMain.on('tray:icon', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(dataUrl);
    buildTray(img.resize({ width: 16, height: 16 }));
  });

  ipcMain.handle('tools:check', () => tools.check(settings));
  ipcMain.handle('env:check', async () => {
    const t = await tools.check(settings);
    const gpu = await tools.gpuInfo();
    let dirWritable = false;
    try { fs.accessSync(settings.downloadDir, fs.constants.W_OK); dirWritable = true; } catch {}
    let python = { ok: false, version: null, whisper: false };
    const py = await tools.pythonInfo(settings);
    if (py.path) python = { ok: true, version: py.version, whisper: py.whisper };
    return { ...t, gpu, python, dirWritable, downloadDir: settings.downloadDir, cookies: !!(settings.cookieFile && fs.existsSync(settings.cookieFile)) };
  });
  ipcMain.handle('settings:get', () => ({ ...settings }));
  ipcMain.handle('settings:set', (_e, patch) => {
    Object.assign(settings, patch);
    if (!fs.existsSync(settings.downloadDir)) fs.mkdirSync(settings.downloadDir, { recursive: true });
    saveSettings();
    tasks.maxConcurrent = settings.maxConcurrent;
    tools.invalidate();
    watchCookies();
    send('theme:changed', nativeTheme.shouldUseDarkColors);
    return { ...settings };
  });
  ipcMain.handle('theme:current', () => nativeTheme.shouldUseDarkColors);
  nativeTheme.on('updated', () => send('theme:changed', nativeTheme.shouldUseDarkColors));

  ipcMain.handle('dialog:file', async (_e, filters) => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters || [{ name: '媒体文件', extensions: MEDIA_EXT }]
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:dir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:files', async (_e, filters) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('music:decrypt', (_e, { files }) => {
    const outDir = path.join(settings.downloadDir, '解密音乐');
    return files.map(f => tasks.add({
      type: 'decrypt', title: path.basename(f),
      subtitle: '解密 · ' + path.extname(f).slice(1).toUpperCase(),
      inputFile: f, outputPath: null, parse: 'inline',
      meta: { duration: 0, resolution: '—', codec: path.extname(f).slice(1).toUpperCase(), size: 0 },
      inline: async (t, prog) => {
        const r = await music.decryptFile(f, outDir, prog);
        t.outputPath = r.out;
        t.meta.codec = r.ext.toUpperCase();
      }
    }));
  });
  ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('shell:external', (_e, u) => shell.openExternal(u));
  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
  ipcMain.handle('fs:readText', (_e, file) => {
    const st = fs.statSync(file);
    if (st.size > 4 * 1024 * 1024) throw new Error('文件过大（>4MB）');
    return fs.readFileSync(file, 'utf8').replace(/^/, '');
  });

  ipcMain.handle('media:probe', (_e, file) => tools.probe(settings, file));
  ipcMain.handle('media:frame', async (_e, file, time) => {
    const info = await tools.probe(settings, file);
    const out = path.join(os.tmpdir(), `videokit-frame-${Date.now()}.jpg`);
    await tools.runFfmpeg(settings, ['-ss', String(time), '-i', file, '-map', `0:${info.vindex}`, '-frames:v', '1', '-q:v', '3', '-y', out]);
    const data = fs.readFileSync(out).toString('base64');
    fs.unlink(out, () => {});
    return 'data:image/jpeg;base64,' + data;
  });

  ipcMain.handle('library:list', () => libraryList());
  ipcMain.handle('library:info', (_e, file) => libraryInfo(file));
  ipcMain.handle('library:thumb', (_e, file) => libraryThumb(file));
  ipcMain.handle('library:delete', (_e, file) => {
    fs.unlinkSync(file);
    probeCache.delete(file);
    log(`library delete ${file}`);
    return true;
  });

  ipcMain.handle('cookies:status', () => cookieStatus());
  ipcMain.handle('cookies:login', async (_e, url) => {
    const ses = session.fromPartition('persist:videokit-web');
    if (settings.proxy) {
      try { await ses.setProxy({ proxyRules: settings.proxy }); } catch {}
    }
    const w = new BrowserWindow({
      width: 1024, height: 820, parent: win,
      title: '平台登录 — 登录成功后自动关闭并保存 Cookies',
      webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false }
    });
    w.loadURL(url);
    const host = new URL(url).hostname;
    const isYt = host.includes('youtube') || host.includes('google');
    let closing = false;
    const onChanged = (_ev, cookie, cause, removed) => {
      if (closing || removed || !cookie || !cookie.value) return;
      // YouTube 会话 cookie 落在 .youtube.com；仅 .google.com 的 SID 出现时登录尚未完成
      const hit = host.includes('bilibili') ? cookie.name === 'SESSDATA'
        : isYt ? (cookie.domain || '').includes('youtube') && (cookie.name === 'LOGIN_INFO' || cookie.name === 'SID')
        : cookie.name === 'ttwid';
      if (!hit) return;
      closing = true;
      setTimeout(() => { if (!w.isDestroyed()) w.close(); }, 2500);
    };
    ses.cookies.on('changed', onChanged);
    return new Promise(resolve => {
      w.on('closed', async () => {
        ses.cookies.removeListener('changed', onChanged);
        try {
          const cookies = await ses.cookies.get({});
          const file = mergeCookies(cookies);
          send('cookies:saved', { count: cookies.length, file });
          resolve({ count: cookies.length, file });
        } catch (e) { resolve({ error: e.message }); }
      });
    });
  });
  ipcMain.handle('cookies:import', async (_e, browser, force) => {
    const r = await importCookies(browser, force);
    send('cookies:saved', r);
    return r;
  });
  ipcMain.handle('cookies:clear', async () => {
    await session.fromPartition('persist:videokit-web').clearStorageData();
    if (settings.cookieFile && fs.existsSync(settings.cookieFile)) fs.unlinkSync(settings.cookieFile);
    settings.cookieFile = '';
    saveSettings();
    return true;
  });

  ipcMain.handle('parse:url', async (_e, url) => {
    const t = await tools.resolve(settings);
    if (!t.ytdlp) throw new Error('未找到 yt-dlp，请在设置中指定路径或安装：pip install yt-dlp');
    const json = await new Promise((resolve, reject) => {
      const child = spawn(t.ytdlp, ['-J', '--no-playlist', '--no-warnings', '--socket-timeout', '20',
        '--js-runtimes', 'node', ...cookieArgs(), ...netArgs(), url], { windowsHide: true, env: tools.childEnv() });
      let out = '', err = '';
      child.stdout.on('data', d => (out += d));
      child.stderr.on('data', d => (err += d));
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) { try { resolve(JSON.parse(out)); } catch { reject(new Error('解析结果无法读取')); } }
        else reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `解析失败 (exit ${code})`));
      });
    });
    const formats = (json.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
    const audios = (json.formats || []).filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
    const bestAudio = audios.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
    const heights = [...new Set(formats.map(f => f.height))].sort((a, b) => b - a).slice(0, 6);
    const subs = Object.keys(json.subtitles || {});
    const rows = heights.map(h => {
      const v = formats.filter(f => f.height === h).sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
      const vsize = v.filesize || v.filesize_approx || 0;
      const asize = bestAudio ? (bestAudio.filesize || bestAudio.filesize_approx || 0) : 0;
      return {
        key: String(h), height: h, fps: Math.round(v.fps || 0),
        vcodec: (v.vcodec || '').split('.')[0], acodec: bestAudio ? (bestAudio.acodec || '').split('.')[0] : null,
        size: vsize + asize, subs: subs.length
      };
    });
    if (bestAudio) rows.push({
      key: 'audio', height: 0, fps: 0, vcodec: null,
      acodec: (bestAudio.acodec || '').split('.')[0],
      size: bestAudio.filesize || bestAudio.filesize_approx || 0, subs: 0
    });
    return {
      id: json.id, title: json.title || json.id, thumbnail: json.thumbnail,
      duration: json.duration, uploader: json.uploader || json.channel || json.extractor_key,
      webpage: json.webpage_url || url, extractor: json.extractor_key,
      heights, rows, subtitles: subs
    };
  });

  ipcMain.handle('download:start', (_e, { url, info, formatKey, merge, subs, audioFormat }) => {
    checkWired();
    const dir = settings.downloadDir;
    const base = safeName(info.title);
    const args = ['--newline', '--no-playlist', '--no-warnings', '--windows-filenames', '--no-mtime',
      '--socket-timeout', '20', '--js-runtimes', 'node',
      '--concurrent-fragments', String(settings.downloadThreads || 16),
      '--retries', '5', '--fragment-retries', '5', ...cookieArgs(), ...netArgs(),
      '-o', path.join(dir, `${base}.%(ext)s`)];
    const row = (info.rows || []).find(r => r.key === formatKey) || (info.rows || [])[0];
    let meta = { duration: info.duration, resolution: row && row.height ? `${row.height}P` : '—', codec: row ? (row.vcodec || row.acodec || '—') : '—', size: row ? row.size : 0 };
    if (formatKey === 'audio') {
      args.push('-f', 'ba/b', '-x', '--audio-format', audioFormat || 'mp3', '--audio-quality', '0');
      meta = { duration: info.duration, resolution: '音频', codec: (audioFormat || 'mp3').toUpperCase(), size: row ? row.size : 0 };
    } else {
      const h = row ? row.height : 0;
      const pref = settings.codecPref === 'av1' ? 'bv*[vcodec^=av01]' : settings.codecPref === 'h265' ? 'bv*[vcodec~="^(hev1|hvc1)"]' : 'bv*';
      const cap = h ? `[height<=${h}]` : '';
      const sel = merge === false
        ? `${pref}${cap},${pref === 'bv*' ? 'ba' : 'ba'}/b${cap}`
        : `${pref}${cap}+ba/b${cap}`;
      args.push('-f', sel);
      if (merge !== false) args.push('--merge-output-format', 'mp4');
    }
    if (subs) args.push('--write-subs', '--sub-langs', 'all');
    args.push(url);
    return tasks.add({
      type: 'download', title: info.title,
      subtitle: `${info.extractor || ''} · ${formatKey === 'audio' ? '仅音频' : (row ? row.height + 'P' : '最佳')}`,
      thumb: info.thumbnail, info,
      cmdKey: 'ytdlp', args,
      outputPath: path.join(dir, base + (formatKey === 'audio' ? '.' + (audioFormat || 'mp3') : '.mp4')),
      parse: 'ytdlp', meta
    });
  });

  ipcMain.handle('convert:start', async (_e, opts) => {
    const { file, format, resolution, crf, audioKbps } = opts;
    const dir = settings.downloadDir;
    const base = safeName(path.basename(file, path.extname(file))) + '_转换';
    const out = uniqueOut(dir, base, format === 'alac' ? 'm4a' : format);
    const audioOnly = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'aiff', 'alac'].includes(format);
    const useGpu = !audioOnly && format !== 'webm' && format !== 'gif' && await wantGpu();
    const buildArgs = gpu => {
      const args = [...(gpu ? ['-hwaccel', 'cuda'] : []), '-i', file, '-map_metadata', '0'];
      if (audioOnly) {
        args.push('-map', `0:${opts.aindex ?? 'a:0'}`, '-vn');
        const depth = parseInt(opts.bitDepth) || 16;
        const rate = opts.sampleRate && opts.sampleRate !== 'original' ? String(opts.sampleRate) : null;
        if (format === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', `${audioKbps || 192}k`);
        else if (format === 'aac' || format === 'm4a') args.push('-c:a', 'aac', '-b:a', `${audioKbps || 192}k`);
        else if (format === 'wav') args.push('-c:a', depth === 24 ? 'pcm_s24le' : depth === 32 ? 'pcm_s32le' : 'pcm_s16le');
        else if (format === 'aiff') args.push('-c:a', depth === 24 ? 'pcm_s24be' : depth === 32 ? 'pcm_s32be' : 'pcm_s16be');
        else if (format === 'flac') args.push('-c:a', 'flac', '-compression_level', '8', '-sample_fmt', depth >= 24 ? 's32' : 's16');
        else if (format === 'alac') args.push('-c:a', 'alac', '-sample_fmt', depth >= 24 ? 's32p' : 's16p');
        if (rate) args.push('-ar', rate);
      } else {
        args.push('-map', `0:${opts.vindex ?? 0}`, '-map', `0:${opts.aindex ?? 'a:0'}?`);
        const vf = [];
        if (resolution && resolution !== 'original') vf.push(`scale=-2:'min(${resolution},ih)'`);
        if (format === 'gif') {
          vf.push('fps=12', `scale='min(640,iw)':-2:flags=lanczos`);
          args.push('-vf', vf.join(','), '-loop', '0');
        } else {
          if (vf.length) args.push('-vf', vf.join(','));
          if (format === 'webm') args.push('-c:v', 'libvpx-vp9', '-crf', String(crf ?? 30), '-b:v', '0', '-c:a', 'libopus');
          else args.push(...videoEncodeArgs(crf ?? 21, gpu), '-c:a', 'aac', '-b:a', `${audioKbps || 192}k`);
          if (format === 'mp4' || format === 'mov') args.push('-movflags', '+faststart');
        }
      }
      args.push('-y', out);
      return args;
    };
    return tasks.add({
      type: 'convert', title: path.basename(file),
      subtitle: `转换为 ${format.toUpperCase()}${resolution !== 'original' && !audioOnly ? ' · ' + resolution + 'P' : ''}${useGpu ? ' · GPU' : ''}`,
      cmdKey: 'ffmpeg', args: buildArgs(useGpu), cpuFallbackArgs: useGpu ? buildArgs(false) : null,
      outputPath: out, parse: 'ffmpeg', durationHint: opts.duration,
      fpsHint: opts.fps, hasAudio: audioOnly ? true : opts.hasAudio, inputFile: file,
      meta: { duration: opts.duration, resolution: resolution !== 'original' ? resolution + 'P' : '原始', codec: useGpu ? 'H.264·NVENC' : format.toUpperCase(), size: 0 }
    });
  });

  ipcMain.handle('extract:start', (_e, opts) => {
    const { file, mode, audioFormat, duration } = opts;
    const dir = settings.downloadDir;
    const base = safeName(path.basename(file, path.extname(file)));
    const ids = [];
    const audioCodecArgs = fmt => {
      if (fmt === 'mp3') return ['-c:a', 'libmp3lame', '-b:a', '192k'];
      if (fmt === 'wav') return ['-c:a', 'pcm_s16le'];
      if (fmt === 'flac') return ['-c:a', 'flac'];
      if (fmt === 'm4a') return ['-c:a', 'aac', '-b:a', '192k'];
      return ['-c:a', 'copy'];
    };
    if (mode === 'audio' || mode === 'both') {
      const fmt = audioFormat || 'mp3';
      const out = uniqueOut(dir, base + '_音频', fmt);
      ids.push(tasks.add({
        type: 'extract', title: path.basename(file), subtitle: `提取音频 → ${fmt.toUpperCase()}`,
        cmdKey: 'ffmpeg', args: ['-i', file, '-vn', '-map', '0:a:0?', ...audioCodecArgs(fmt), '-y', out],
        outputPath: out, parse: 'ffmpeg', durationHint: duration, hasAudio: true, inputFile: file,
        meta: { duration, resolution: '音频', codec: fmt.toUpperCase(), size: 0 }
      }));
    }
    if (mode === 'video' || mode === 'both') {
      const out = uniqueOut(dir, base + '_无声视频', 'mp4');
      ids.push(tasks.add({
        type: 'extract', title: path.basename(file), subtitle: '分离无声视频',
        cmdKey: 'ffmpeg', args: ['-i', file, '-map', `0:${opts.vindex ?? 0}`, '-an', '-c:v', 'copy', '-y', out],
        outputPath: out, parse: 'ffmpeg', durationHint: duration, fpsHint: opts.fps, hasAudio: false, inputFile: file,
        meta: { duration, resolution: '原始', codec: 'H.264', size: 0 }
      }));
    }
    return ids;
  });

  ipcMain.handle('watermark:start', async (_e, opts) => {
    const { file, mode, regions, keep, duration } = opts;
    const dir = settings.downloadDir;
    const base = safeName(path.basename(file, path.extname(file))) + '_去水印';
    const out = uniqueOut(dir, base, 'mp4');
    let vf;
    if (mode === 'crop') {
      const even = n => Math.max(2, Math.round(n) - (Math.round(n) % 2));
      const x = Math.max(0, Math.round(keep.x) - (Math.round(keep.x) % 2));
      const y = Math.max(0, Math.round(keep.y) - (Math.round(keep.y) % 2));
      vf = `crop=${even(keep.w)}:${even(keep.h)}:${x}:${y}`;
    } else if (mode === 'delogo') {
      const W = opts.width || 1920, H = opts.height || 1080;
      vf = regions.map(r => {
        let x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
        x = Math.min(Math.max(1, x), W - 3);
        y = Math.min(Math.max(1, y), H - 3);
        w = Math.min(Math.max(2, w), W - x - 1);
        h = Math.min(Math.max(2, h), H - y - 1);
        return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
      }).join(',');
    } else {
      vf = buildBlurChain(regions);
    }
    const vidx = opts.vindex ?? 0;
    const amap = opts.aindex != null ? `0:${opts.aindex}` : '0:a:0?';
    const useGpu = await wantGpu();
    const buildArgs = gpu => {
      const args = [...(gpu ? ['-hwaccel', 'cuda'] : []), '-i', file];
      if (mode === 'blur') args.push('-filter_complex', buildBlurChain(regions, vidx), '-map', '[vout]', '-map', amap);
      else args.push('-map', `0:${vidx}`, '-map', amap, '-vf', vf);
      args.push(...videoEncodeArgs(20, gpu), '-c:a', 'copy', '-y', out);
      return args;
    };
    return tasks.add({
      type: 'watermark', title: path.basename(file),
      subtitle: (mode === 'delogo' ? `智能修补 · ${regions.length} 个区域` : mode === 'blur' ? `模糊遮盖 · ${regions.length} 个区域` : '裁剪画面') + (useGpu ? ' · GPU' : ''),
      cmdKey: 'ffmpeg', args: buildArgs(useGpu), cpuFallbackArgs: useGpu ? buildArgs(false) : null,
      outputPath: out, parse: 'ffmpeg', durationHint: duration,
      fpsHint: opts.fps, hasAudio: opts.hasAudio, inputFile: file,
      meta: { duration, resolution: '原始', codec: useGpu ? 'H.264·NVENC' : 'H.264', size: 0 }
    });
  });

  ipcMain.handle('subtitle:load', (_e, file) => {
    const text = fs.readFileSync(file, 'utf8').replace(/^/, '');
    const ext = path.extname(file).slice(1).toLowerCase();
    if (ext === 'ass' || text.includes('[Script Info]')) return { format: 'ass', entries: parseAss(text) };
    if (ext === 'vtt' || text.startsWith('WEBVTT')) return { format: 'vtt', entries: parseSrt(text.replace(/^WEBVTT[^\n]*\n/, '')) };
    return { format: 'srt', entries: parseSrt(text) };
  });

  ipcMain.handle('subtitle:search', async (_e, opts) => {
    const { query, year, lang, file } = opts;
    const token = await subsLogin();
    const searches = [];
    if (file && fs.existsSync(file)) {
      searches.push({ moviehash: osHash(file), moviebytesize: fs.statSync(file).size, sublanguageid: lang || 'chi' });
    }
    if (query) {
      const s = { query, sublanguageid: lang || 'chi' };
      if (year) s.year = parseInt(year);
      searches.push(s);
    }
    if (!searches.length) throw new Error('请输入片名或选择视频文件');
    const members = s => Object.entries(s).map(([k, v]) =>
      `<member><name>${k}</name><value>${typeof v === 'number' ? `<int>${v}</int>` : `<string>${xmlEsc(v)}</string>`}</value></member>`).join('');
    const params = xmlStr(token) +
      `<param><value><array><data>${searches.map(s => `<value><struct>${members(s)}</struct></value>`).join('')}</data></array></value></param>`;
    const d = await subsRpc('SearchSubtitles', params);
    const list = (d && d.data) || [];
    const seen = new Set();
    const out = [];
    for (const it of list) {
      if (!it || !it.SubDownloadLink || seen.has(it.IDSubtitleFile)) continue;
      seen.add(it.IDSubtitleFile);
      out.push({
        id: it.IDSubtitleFile, name: it.SubFileName || it.MovieName || '',
        movie: it.MovieName || '', lang: it.SubLanguageID || '', format: it.SubFormat || 'srt',
        downloads: it.SubDownloadsCnt || 0, url: it.SubDownloadLink,
        matched: it.MatchedBy === 'moviehash' ? '哈希精确匹配' : '片名匹配'
      });
    }
    return out.slice(0, 40);
  });

  ipcMain.handle('subtitle:fetch', async (_e, url) => {
    const grab = async () => {
      let b64 = null;
      for (let i = 0; i < 6; i++) {
        const r = await subsCall({ kind: 'fetch', url });
        if (r && r.cf) { await new Promise(res => setTimeout(res, 4000)); continue; }
        b64 = r;
        break;
      }
      if (!b64) throw new Error('字幕下载失败：站点验证未通过');
      return Buffer.from(b64, 'base64');
    };
    try {
      return decodeSubBuffer(await grab());
    } catch (e) {
      if (e.code === 'OS_ANON_LIMIT') {
        if (settings.osUser && settings.osPass) {
          await subsLogin(true);
          return decodeSubBuffer(await grab());
        }
        throw new Error('OpenSubtitles 限制匿名下载：请在 设置→在线字幕 填写免费账号后重试，或使用「粘贴字幕直链」');
      }
      throw e;
    }
  });

  ipcMain.handle('subtitle:asr', (_e, opts) => {
    const { file, model, language, device, duration } = opts;
    fs.mkdirSync(subsDir(), { recursive: true });
    const out = path.join(subsDir(), safeName(path.basename(file, path.extname(file))) + '.srt');
    return tasks.add({
      type: 'asr', title: path.basename(file),
      subtitle: `语音识别 · ${model} · ${device === 'auto' ? '自动设备' : device}`,
      cmdKey: 'python',
      args: [helperPath('asr_helper.py'), file, out,
        '--model', model || 'small', '--models-dir', modelsDir(),
        '--language', language || '', '--device', device || 'auto'],
      outputPath: out, parse: 'asr', inputFile: file, durationHint: duration,
      meta: { duration, resolution: '—', codec: 'SRT', size: 0 }
    });
  });

  ipcMain.handle('subtitle:apply', async (_e, opts) => {
    const { file, entries, mode, container, style, duration, vindex, aindex, fps, hasAudio } = opts;
    fs.mkdirSync(subsDir(), { recursive: true });
    const srt = path.join(subsDir(), `apply-${Date.now()}.srt`);
    fs.writeFileSync(srt, writeSrt(entries), 'utf8');
    const dir = settings.downloadDir;
    const base = safeName(path.basename(file, path.extname(file))) + '_字幕';
    const useGpu = mode === 'burn' && await wantGpu();
    if (mode === 'mux') {
      const ext = container === 'mkv' ? 'mkv' : 'mp4';
      const out = uniqueOut(dir, base, ext);
      return tasks.add({
        type: 'subtitle', title: path.basename(file), subtitle: `软封装 · ${ext.toUpperCase()} · ${entries.length} 条`,
        cmdKey: 'ffmpeg',
        args: ['-i', file, '-i', srt, '-map', `0:${vindex ?? 0}`, '-map', `0:${aindex ?? 'a:0'}?`, '-map', '1:0',
          '-c:v', 'copy', '-c:a', 'copy', '-c:s', ext === 'mkv' ? 'srt' : 'mov_text', '-y', out],
        outputPath: out, parse: 'ffmpeg', durationHint: duration, fpsHint: fps, hasAudio, inputFile: file,
        meta: { duration, resolution: '原始', codec: 'COPY+SUB', size: 0 }
      });
    }
    const out = uniqueOut(dir, base, 'mp4');
    const fs2 = style.fontSize || 22;
    const color = style.color === 'yellow' ? '&H0000FFFF' : '&H00FFFFFF';
    const force = `FontName=Microsoft YaHei,FontSize=${fs2},PrimaryColour=${color},OutlineColour=&H00000000,Outline=1,Shadow=0,MarginV=${style.marginV ?? 30},BorderStyle=1`;
    const vf = `subtitles='${escapeFilterPath(srt)}':force_style='${force}'`;
    const buildArgs = gpu => [
      ...(gpu ? ['-hwaccel', 'cuda'] : []), '-i', file,
      '-map', `0:${vindex ?? 0}`, '-map', `0:${aindex ?? 'a:0'}?`, '-vf', vf,
      ...videoEncodeArgs(20, gpu), '-c:a', 'copy', '-y', out
    ];
    return tasks.add({
      type: 'subtitle', title: path.basename(file),
      subtitle: `硬烧录 · ${entries.length} 条${useGpu ? ' · GPU' : ''}`,
      cmdKey: 'ffmpeg', args: buildArgs(useGpu), cpuFallbackArgs: useGpu ? buildArgs(false) : null,
      outputPath: out, parse: 'ffmpeg', durationHint: duration, fpsHint: fps, hasAudio, inputFile: file,
      meta: { duration, resolution: '原始', codec: useGpu ? 'H.264·NVENC' : 'H.264', size: 0 }
    });
  });

  ipcMain.handle('lyrics:search', (_e, query) => lyrics.searchSongs(query));
  ipcMain.handle('lyrics:fetch', (_e, id) => lyrics.fetchLyric(id));
  ipcMain.handle('lyrics:burn', (_e, { files, text, synced }) => {
    return files.map(f => tasks.add({
      type: 'lyrics', title: path.basename(f),
      subtitle: '歌词烧录 · ' + path.extname(f).slice(1).toUpperCase(),
      inputFile: f, outputPath: f, parse: 'inline',
      meta: { duration: 0, resolution: '—', codec: path.extname(f).slice(1).toUpperCase(), size: 0 },
      inline: async (t, prog) => {
        prog(20);
        const r = await lyrics.burnLyrics(f, text, { synced }, args => tools.runFfmpeg(settings, args));
        prog(90);
        t.meta.size = fs.statSync(r.file).size;
        t.subtitle = `歌词烧录 · ${r.synced ? r.synced + ' 条时间轴' : '纯文本'}`;
      }
    }));
  });

  ipcMain.handle('task:pause', (_e, id) => tasks.pause(id));
  ipcMain.handle('task:resume', (_e, id) => tasks.resume(id));
  ipcMain.handle('tasks:pauseAll', () => tasks.pauseAll());
  ipcMain.handle('tasks:resumeAll', () => tasks.resumeAll());
  ipcMain.handle('task:cancel', (_e, id) => tasks.cancel(id));
  ipcMain.handle('task:remove', (_e, id) => tasks.remove(id));
  ipcMain.handle('task:retry', (_e, id) => tasks.retry(id));
  ipcMain.handle('tasks:list', () => tasks.list());
  ipcMain.handle('tasks:clear', () => tasks.clearFinished());
  ipcMain.on('task:context', (_e, id, x, y) => taskContextMenu(id, x, y));
}

function buildBlurChain(regions, vidx = 0) {
  const n = regions.length;
  const parts = [`[0:${vidx}]split=${n + 1}[base]${regions.map(r => `[s${r.id}]`).join('')}`];
  regions.forEach(r => {
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const w = Math.max(2, Math.round(r.w)), h = Math.max(2, Math.round(r.h));
    const lr = Math.max(1, Math.min(18, Math.floor(Math.min(w, h) / 2)));
    const cr = Math.max(0, Math.min(Math.floor(lr / 2), Math.floor(Math.ceil(w / 2) / 2), Math.floor(Math.ceil(h / 2) / 2)));
    parts.push(`[s${r.id}]crop=${w}:${h}:${x}:${y},boxblur=${lr}:2:${cr}:2[fg${r.id}]`);
  });
  let prev = '[base]';
  regions.forEach((r, i) => {
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const dst = i === n - 1 ? '[vout]' : `[m${i}]`;
    parts.push(`${prev}[fg${r.id}]overlay=${x}:${y}${dst}`);
    prev = dst;
  });
  return parts.join(';');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    loadSettings();
    tasks = new TaskManager(settings, tools, send);
    registerIpc();
    watchCookies();
    createWindow();
  });
  app.on('window-all-closed', () => {
    if (quitting || !settings.minimizeToTray || !tray) { tasks.killAll(); app.quit(); }
  });
  app.on('before-quit', () => {
    quitting = true;
    tasks.killAll();
    if (subsChrome && subsChrome.exitCode === null) {
      execFile('taskkill', ['/pid', String(subsChrome.pid), '/T', '/F'], () => {});
    }
  });
}