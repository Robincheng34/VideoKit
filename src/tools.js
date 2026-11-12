const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let cache = null;

function candidates(name, custom) {
  const list = [];
  if (custom) list.push(custom);
  list.push(name);
  if (name === 'ffmpeg') {
    const local = process.env.LOCALAPPDATA || '';
    const base = path.join(local, 'ffmpeg');
    if (fs.existsSync(base)) {
      for (const d of fs.readdirSync(base)) {
        const p = path.join(base, d, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(p)) list.push(p);
      }
    }
  }
  return list;
}

function version(cmd) {
  return new Promise(resolve => {
    const flag = /yt-dlp/i.test(cmd) ? '--version' : '-version';
    let child;
    try {
      child = spawn(cmd, [flag], { windowsHide: true });
    } catch {
      return resolve(null);
    }
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 8000);
    child.stdout.on('data', d => (out += d));
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      const line = (out.split('\n')[0] || '').trim();
      const m = line.match(/version\s+([\w.\-]+)/);
      resolve(m ? m[1] : line.slice(0, 40));
    });
  });
}

async function resolve(settings) {
  if (cache) return cache;
  const result = { ffmpeg: null, ffprobe: null, ytdlp: null, ffmpegVersion: null, ytdlpVersion: null };
  for (const c of candidates('ffmpeg', settings.ffmpegPath)) {
    const v = await version(c);
    if (v) {
      result.ffmpeg = c;
      result.ffmpegVersion = v;
      const probe = c === 'ffmpeg' ? 'ffprobe' : path.join(path.dirname(c), 'ffprobe.exe');
      if (await version(probe)) result.ffprobe = probe;
      break;
    }
  }
  for (const c of candidates('yt-dlp', settings.ytdlpPath)) {
    const v = await version(c);
    if (v) { result.ytdlp = c; result.ytdlpVersion = v; break; }
  }
  result.python = (await pythonInfo(settings)).path;
  cache = result;
  return result;
}

let gpuCache = null;
async function gpuInfo() {
  if (gpuCache) return gpuCache;
  const t = await resolve({});
  let nvenc = false;
  if (t.ffmpeg) {
    const out = await new Promise(res => {
      const c = spawn(t.ffmpeg, ['-hide_banner', '-encoders'], { windowsHide: true });
      let o = '';
      c.stdout.on('data', d => (o += d));
      c.on('close', () => res(o));
      c.on('error', () => res(''));
    });
    nvenc = /h264_nvenc/.test(out);
  }
  let name = null;
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { windowsHide: true, encoding: 'utf8', timeout: 4000 });
    if (r.status === 0) name = (r.stdout || '').trim().split('\n')[0] || null;
  } catch {}
  gpuCache = { nvenc, name };
  return gpuCache;
}

let pyCache = null;
async function pythonInfo(settings) {
  if (pyCache) return pyCache;
  const cands = [];
  if (settings && settings.pythonPath) cands.push(settings.pythonPath);
  try {
    const w = spawnSync('where.exe', ['python'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    for (const line of (w.stdout || '').split('\n')) {
      const p = line.trim();
      if (p && !cands.includes(p)) cands.push(p);
    }
  } catch {}
  cands.push('python', 'python3', 'py');
  for (const c of cands) {
    let r;
    try {
      r = spawnSync(c, ['-c', 'import sys;print(sys.version.split()[0])'], { windowsHide: true, encoding: 'utf8', timeout: 8000, env: childEnv() });
    } catch { continue; }
    if (r.status === 0 && /^\d+\.\d+/.test((r.stdout || '').trim())) {
      let w = { status: 1 };
      try {
        w = spawnSync(c, ['-c', 'import faster_whisper;print("ok")'], { windowsHide: true, encoding: 'utf8', timeout: 20000, env: childEnv() });
      } catch {}
      pyCache = { path: c, version: (r.stdout || '').trim(), whisper: w.status === 0 };
      return pyCache;
    }
  }
  pyCache = { path: null, version: null, whisper: false };
  return pyCache;
}

function invalidate() { cache = null; gpuCache = null; pyCache = null; }

async function check(settings) {
  const t = await resolve(settings);
  let nodeVersion = null;
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 5000, env: childEnv() });
    if (r.status === 0) nodeVersion = (r.stdout || '').trim();
  } catch {}
  return {
    ffmpeg: !!t.ffmpeg, ffprobe: !!t.ffprobe, ytdlp: !!t.ytdlp,
    ffmpegPath: t.ffmpeg, ytdlpPath: t.ytdlp,
    ffmpegVersion: t.ffmpegVersion, ytdlpVersion: t.ytdlpVersion,
    node: !!nodeVersion, nodeVersion
  };
}

function runFfmpeg(settings, args) {
  return resolve(settings).then(t => new Promise((res, rej) => {
    if (!t.ffmpeg) return rej(new Error('未找到 ffmpeg'));
    const child = spawn(t.ffmpeg, ['-hide_banner', ...args], { windowsHide: true });
    let err = '';
    child.stderr.on('data', d => (err += d));
    child.on('error', rej);
    child.on('close', code => code === 0 ? res() : rej(new Error(err.split('\n').slice(-4).join('\n'))));
  }));
}

function parseRate(s) {
  const m = String(s || '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[2]) ? parseFloat(m[1]) / parseFloat(m[2]) : 0;
  return parseFloat(s) || 0;
}

async function probe(settings, file) {
  const t = await resolve(settings);
  if (!t.ffprobe) throw new Error('未找到 ffprobe');
  const attempt = () => new Promise((res, rej) => {
    const child = spawn(t.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', rej);
    child.on('close', code => {
      if (code !== 0) return rej(new Error(err || '无法读取媒体信息'));
      try {
        const j = JSON.parse(out);
        const vids = (j.streams || []).filter(s => s.codec_type === 'video');
        const v = vids.find(s => !(s.disposition && s.disposition.attached_pic)) || vids[0];
        const a = (j.streams || []).find(s => s.codec_type === 'audio');
        res({
          duration: parseFloat(j.format?.duration || 0),
          size: parseInt(j.format?.size || 0),
          bitrate: parseInt(j.format?.bit_rate || 0),
          width: v?.width || 0,
          height: v?.height || 0,
          vcodec: v?.codec_name || null,
          acodec: a?.codec_name || null,
          vindex: v ? v.index : 0,
          aindex: a ? a.index : null,
          fps: v ? parseRate(v.avg_frame_rate) : 0,
          formatName: j.format?.format_name
        });
      } catch { rej(new Error('媒体信息解析失败')); }
    });
  });
  try { return await attempt(); }
  catch { await new Promise(r => setTimeout(r, 800)); return attempt(); }
}

function childEnv() {
  const env = { ...process.env };
  // Windows 资源管理器启动的进程键名为 "Path"，直接写 PATH 会产生重复键导致子进程找不到可执行文件
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const nodeDir = path.join(process.env.LOCALAPPDATA || '', 'nodejs');
  if (fs.existsSync(path.join(nodeDir, 'node.exe'))) {
    env[pathKey] = nodeDir + path.delimiter + (env[pathKey] || '');
  }
  if (!env.HF_ENDPOINT) env.HF_ENDPOINT = 'https://hf-mirror.com';
  return env;
}

function verifyOutput(settings, file, expect, onChild) {
  return resolve(settings).then(async t => {
    if (!t.ffprobe || !t.ffmpeg) throw new Error('缺少校验引擎');
    const info = await probe(settings, file);
    if (!info.duration || info.duration <= 0) throw new Error('输出时长无效');
    if (expect.duration && Math.abs(info.duration - expect.duration) / expect.duration > 0.1)
      throw new Error(`输出时长 ${info.duration.toFixed(1)}s 与源 ${expect.duration.toFixed(1)}s 不符`);
    if (expect.hasAudio && !info.acodec) throw new Error('缺少音频流');
    if (!info.vcodec && !info.acodec) throw new Error('无可解码流');
    const gpu = settings.encoder !== 'cpu' && (await gpuInfo()).nvenc;
    await new Promise((res, rej) => {
      const child = spawn(t.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-xerror',
        ...(gpu ? ['-hwaccel', 'cuda'] : []), '-i', file,
        '-map', '0:v:0?', '-map', '0:a:0?', '-f', 'null', '-'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      if (onChild) onChild(child);
      let err = '';
      const timer = setTimeout(() => { child.kill(); rej(new Error('校验超时')); }, 15 * 60 * 1000);
      child.stderr.on('data', d => (err += d));
      child.on('error', e => { clearTimeout(timer); rej(e); });
      child.on('close', code => {
        clearTimeout(timer);
        code === 0 ? res() : rej(new Error(err.trim().split('\n').slice(-2).join(' ') || `解码退出码 ${code}`));
      });
    });
    return info;
  });
}

module.exports = { resolve, check, invalidate, runFfmpeg, probe, childEnv, verifyOutput, gpuInfo, pythonInfo };