const { spawn, execFile, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let nextId = 1;
const livePids = new Set();
process.on('exit', () => {
  for (const pid of livePids) {
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }); } catch {}
  }
});

class TaskManager {
  constructor(settings, tools, send) {
    this.settings = settings;
    this.tools = tools;
    this.send = send;
    this.tasks = new Map();
    this.maxConcurrent = settings.maxConcurrent || 4;
  }

  add(spec) {
    const task = {
      id: nextId++,
      type: spec.type,
      title: spec.title,
      subtitle: spec.subtitle || '',
      thumb: spec.thumb || null,
      info: spec.info || null,
      meta: spec.meta || {},
      status: 'queued',
      progress: 0,
      finishing: false,
      phase: '',
      speed: '',
      eta: '',
      error: '',
      outputPath: spec.outputPath,
      createdAt: Date.now(),
      finishedAt: null,
      _spec: spec,
      _child: null,
      _errTail: '',
      _outTail: ''
    };
    this.tasks.set(task.id, task);
    this.emit(task);
    this.pump();
    return task.id;
  }

  get(id) { return this.tasks.get(id); }

  list() {
    return [...this.tasks.values()].map(t => this.public(t)).sort((a, b) => b.createdAt - a.createdAt);
  }

  public(t) {
    const out = {};
    for (const [k, v] of Object.entries(t)) {
      if (!k.startsWith('_')) out[k] = v;
    }
    return out;
  }

  emit(t) { this.send('task:update', this.public(t)); }

  pump() {
    const running = [...this.tasks.values()].filter(t => t.status === 'running').length;
    let slots = this.maxConcurrent - running;
    if (slots <= 0) return;
    for (const t of this.tasks.values()) {
      if (slots <= 0) break;
      if (t.status === 'queued') { this.start(t); slots--; }
    }
  }

  killTree(child) {
    if (!child) return;
    livePids.delete(child.pid);
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    else child.kill('SIGKILL');
  }

  async start(t) {
    const spec = t._spec;
    t.status = 'running';
    t.finishing = false;
    t.phase = '';
    t.error = '';
    this.emit(t);
    if (spec.inline) {
      try {
        await spec.inline(t, p => { t.progress = p; this.emit(t); });
        t.status = 'done';
        t.progress = 100;
        t.finishedAt = Date.now();
        if (t.outputPath && fs.existsSync(t.outputPath)) t.meta.size = fs.statSync(t.outputPath).size;
        this.emit(t);
        this.pump();
      } catch (e) {
        this.fail(t, e.message);
      }
      return;
    }
    let resolved;
    try { resolved = await this.tools.resolve(this.settings); }
    catch (e) { return this.fail(t, e.message); }
    const cmd = spec.cmdKey === 'ytdlp' ? resolved.ytdlp
      : spec.cmdKey === 'python' ? (resolved.python || 'python')
      : resolved.ffmpeg;
    if (!cmd) return this.fail(t, spec.cmdKey === 'ytdlp' ? '未找到 yt-dlp，请在设置中配置' : '未找到 ffmpeg，请在设置中配置');
    if (spec.inputFile && !fs.existsSync(spec.inputFile)) {
      return this.fail(t, `源文件不存在或已被移动：${spec.inputFile}`);
    }
    const args = spec.cmdKey === 'ffmpeg' ? ['-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:1', ...spec.args] : spec.args;
    let child;
    try {
      child = spawn(cmd, args, {
        windowsHide: true,
        env: this.tools.childEnv(),
        stdio: spec.cmdKey === 'ffmpeg' ? ['ignore', 'pipe', 'pipe'] : undefined
      });
    } catch (e) { return this.fail(t, e.message); }
    t._child = child;
    livePids.add(child.pid);
    t._lastData = Date.now();
    const watchdog = setInterval(() => {
      if (t.status === 'running' && !(spec.parse === 'asr' && t.phase === '下载模型') && Date.now() - t._lastData > 60000) {
        clearInterval(watchdog);
        this.killTree(child);
        this.fail(t, '进程 60 秒无输出，判定为卡死，可重试');
      }
    }, 15000);
    let buf = '';
    const onLine = line => {
      t._lastData = Date.now();
      if (spec.parse === 'ytdlp') this.parseYtdlp(t, line);
      else if (spec.parse === 'asr') this.parseAsr(t, line);
      else this.parseFfmpeg(t, line, spec);
    };
    const handle = d => {
      t._lastData = Date.now();
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', d => {
      t._lastData = Date.now();
      t._errTail = (t._errTail + d.toString()).slice(-4000);
      if (spec.parse === 'ytdlp') handle(d);
    });
    child.on('error', e => { clearInterval(watchdog); this.fail(t, e.message); });
    child.on('close', code => {
      clearInterval(watchdog);
      livePids.delete(child.pid);
      t._child = null;
      if (t.status === 'cancelled' || t.status === 'paused') { this.pump(); return; }
      if (code === 0) {
        t.progress = 100;
        t.finishing = false;
        t.speed = '';
        t.eta = '';
        t.finishedAt = Date.now();
        if (t.outputPath && !fs.existsSync(t.outputPath)) {
          const found = this.guessOutput(t);
          if (found) t.outputPath = found;
        }
        if (t.outputPath && fs.existsSync(t.outputPath)) t.meta.size = fs.statSync(t.outputPath).size;
        if (this.settings.verifyOutput !== false && spec.parse !== 'asr' && spec.parse !== 'inline' && t.outputPath && fs.existsSync(t.outputPath)) {
          this.verify(t);
          return;
        }
        t.status = 'done';
      } else {
        if (!t._cpuTried && t._spec.cpuFallbackArgs && /nvenc|cuda|npp|cannot load|driver|no capable devices/i.test(t._errTail)) {
          t._cpuTried = true;
          t._spec.args = t._spec.cpuFallbackArgs;
          t.status = 'queued';
          t.progress = 0;
          t.error = '';
          this.emit(t);
          this.pump();
          return;
        }
        const tail = (t._errTail + '\n' + t._outTail).trim().split('\n').filter(Boolean);
        this.fail(t, tail.slice(-3).join('\n').slice(0, 500) || `进程退出码 ${code}`, false);
        return;
      }
      this.emit(t);
      this.pump();
    });
  }

  async verify(t) {
    t.status = 'verifying';
    this.emit(t);
    try {
      const info = await this.tools.verifyOutput(this.settings, t.outputPath, {
        duration: t._duration || t._spec.durationHint,
        hasAudio: t._spec.hasAudio === true,
        hasVideo: t._spec.hasVideo === true
      }, child => { t._verifyChild = child; livePids.add(child.pid); });
      t._verifyChild = null;
      if (t.status === 'cancelled') { this.pump(); return; }
      t.meta = { ...t.meta, duration: info.duration, resolution: info.height ? info.height + 'P' : t.meta.resolution, codec: info.vcodec || t.meta.codec };
      t.status = 'done';
    } catch (e) {
      t._verifyChild = null;
      if (t.status === 'cancelled') { this.pump(); return; }
      this.fail(t, '校验失败：' + e.message, false);
      return;
    }
    this.emit(t);
    this.pump();
  }

  guessOutput(t) {
    try {
      const dir = path.dirname(t.outputPath);
      const base = path.basename(t.outputPath, path.extname(t.outputPath));
      const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
      if (files.length) return path.join(dir, files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0]);
    } catch {}
    return null;
  }

  parseYtdlp(t, line) {
    t._outTail = (t._outTail + '\n' + line).slice(-2000);
    const dest = line.match(/\[download\] Destination: (.+)$/);
    if (dest) t.outputPath = dest[1].trim();
    const merge = line.match(/\[Merger\] Merging formats into "(.+)"$/);
    if (merge) t.outputPath = merge[1];
    const extract = line.match(/\[ExtractAudio\] Destination: (.+)$/);
    if (extract) t.outputPath = extract[1].trim();
    const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)% of ~?\s*([\d.]+\s*\S+)?(?: at\s+(\S+))?(?: ETA\s+(\S+))?/);
    if (m) {
      t.progress = Math.min(99, parseFloat(m[1]));
      t.speed = m[3] || '';
      t.eta = m[4] || '';
      this.emit(t);
    }
  }

  parseAsr(t, line) {
    let j;
    try { j = JSON.parse(line); } catch { return; }
    if (j.type === 'progress') { t.progress = Math.min(99, j.pct); this.emit(t); }
    else if (j.type === 'download') { t.phase = '下载模型'; this.emit(t); }
    else if (j.type === 'ready') { t.phase = `识别中 · ${j.device}`; this.emit(t); }
    else if (j.type === 'warn') { t._errTail += j.msg + '\n'; }
  }

  parseFfmpeg(t, line, spec) {
    if (!t._duration && spec.durationHint) t._duration = spec.durationHint;
    if (line === 'progress=end') {
      t.finishing = true;
      t.progress = 99.9;
      this.emit(t);
      return;
    }
    const fr = line.match(/^frame=\s*(\d+)/);
    if (fr && spec.fpsHint > 0 && t._duration > 0) {
      const total = t._duration * spec.fpsHint;
      t.progress = Math.min(99, (parseInt(fr[1], 10) / total) * 100);
      this.emit(t);
      return;
    }
    const kv = line.match(/^(out_time_us|out_time_ms|speed)=(.*)$/);
    if (!kv) return;
    if (kv[1] === 'speed') { t.speed = kv[2].trim(); return; }
    if (!spec.fpsHint && t._duration > 0) {
      const us = parseInt(kv[2], 10);
      if (us >= 0) {
        const secs = kv[1] === 'out_time_us' ? us / 1e6 : us / 1e3;
        t.progress = Math.min(99, (secs / t._duration) * 100);
        this.emit(t);
      }
    }
  }

  fail(t, msg, emit = true) {
    t.status = 'error';
    t.error = msg;
    t.finishedAt = Date.now();
    t._child = null;
    try {
      if (t.outputPath && fs.existsSync(t.outputPath) && fs.statSync(t.outputPath).size === 0) fs.unlinkSync(t.outputPath);
    } catch {}
    if (emit) this.emit(t);
    this.pump();
  }

  pause(id) {
    const t = this.tasks.get(id);
    if (!t || t.type !== 'download') return false;
    if (t.status === 'queued') {
      t.status = 'paused';
      this.emit(t);
      return true;
    }
    if (t.status === 'running') {
      t.status = 'paused';
      this.killTree(t._child);
      t._child = null;
      t.speed = '';
      t.eta = '';
      this.emit(t);
      this.pump();
      return true;
    }
    return false;
  }

  resume(id) {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'paused') return false;
    t.status = 'queued';
    this.emit(t);
    this.pump();
    return true;
  }

  pauseAll() {
    for (const t of this.tasks.values()) {
      if (t.status === 'running' || t.status === 'queued') this.pause(t.id);
    }
  }

  resumeAll() {
    for (const t of this.tasks.values()) {
      if (t.status === 'paused') this.resume(t.id);
    }
  }

  cancel(id) {
    const t = this.tasks.get(id);
    if (!t) return false;
    if (t.status === 'verifying') {
      t.status = 'cancelled';
      t.finishedAt = Date.now();
      this.killTree(t._verifyChild);
      t._verifyChild = null;
      this.emit(t);
      return true;
    }
    if (['queued', 'paused'].includes(t.status)) {
      t.status = 'cancelled';
      t.finishedAt = Date.now();
      this.emit(t);
      return true;
    }
    if (t.status === 'running' && t._child) {
      t.status = 'cancelled';
      t.finishedAt = Date.now();
      this.killTree(t._child);
      this.emit(t);
      return true;
    }
    return false;
  }

  remove(id) {
    const t = this.tasks.get(id);
    if (!t) return false;
    if (['running', 'queued', 'paused'].includes(t.status)) this.cancel(id);
    this.tasks.delete(id);
    this.send('task:remove', id);
    return true;
  }

  retry(id) {
    const t = this.tasks.get(id);
    if (!t || !['error', 'cancelled', 'paused'].includes(t.status)) return false;
    t.status = 'queued';
    t.progress = 0;
    t.finishing = false;
    t.error = '';
    t.speed = '';
    t.eta = '';
    t._errTail = '';
    t._outTail = '';
    this.emit(t);
    this.pump();
    return true;
  }

  clearFinished() {
    for (const [id, t] of this.tasks) {
      if (['done', 'error', 'cancelled'].includes(t.status)) {
        this.tasks.delete(id);
        this.send('task:remove', id);
      }
    }
  }

  killAll() {
    for (const t of this.tasks.values()) {
      this.killTree(t._child);
      this.killTree(t._verifyChild);
    }
  }
}

module.exports = { TaskManager };