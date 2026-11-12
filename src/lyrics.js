const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');

function parseLrc(text) {
  const synced = [];
  const plainLines = [];
  for (const line of String(text).split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    if (stamps.length) {
      for (const m of stamps) {
        const ms = Math.round((+m[1] * 60 + parseFloat(m[2])) * 1000);
        if (content) synced.push({ time: ms, text: content });
      }
    } else if (content && !/^(ti|ar|al|by|offset|re|ve):/i.test(content)) {
      plainLines.push(content);
    }
  }
  synced.sort((a, b) => a.time - b.time);
  return { synced, plain: plainLines.join('\n') };
}

async function burnLyrics(file, lrcText, opts, runFfmpeg) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const { synced, plain } = parseLrc(lrcText);
  const hasSync = synced.length > 0 && opts.synced !== false;
  if (ext === 'mp3') {
    const tags = {
      unsynchronisedLyrics: { language: 'chi', shortText: '', text: plain || lrcText }
    };
    if (hasSync) {
      tags.synchronisedLyrics = {
        language: 'chi', timeStampFormat: 2, contentType: 1, shortText: '',
        synchronisedText: synced.map(s => ({ text: s.text, timeStamp: s.time }))
      };
    }
    const ok = NodeID3.write(tags, file);
    if (!ok) throw new Error('ID3 标签写入失败');
    return { file, synced: hasSync ? synced.length : 0 };
  }
  if (!['flac', 'ogg', 'm4a', 'wav', 'aiff', 'opus'].includes(ext)) {
    throw new Error('不支持的音频格式：.' + ext);
  }
  const tmp = file + '.lyrtmp.' + ext;
  const args = ['-i', file, '-map', '0', '-c', 'copy'];
  if (ext === 'flac' || ext === 'ogg' || ext === 'opus') args.push('-metadata', 'LYRICS=' + lrcText);
  else args.push('-metadata', 'lyrics=' + lrcText);
  args.push('-y', tmp);
  await runFfmpeg(args);
  fs.unlinkSync(file);
  fs.renameSync(tmp, file);
  return { file, synced: hasSync ? synced.length : 0 };
}

async function searchSongs(query) {
  const r = await fetch('https://music.163.com/api/search/get/web', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://music.163.com/'
    },
    body: `s=${encodeURIComponent(query)}&type=1&limit=8&offset=0`
  });
  const j = await r.json();
  return ((j.result && j.result.songs) || []).map(s => ({
    id: s.id, name: s.name,
    artist: (s.artists || []).map(a => a.name).join(' / '),
    album: s.album && s.album.name
  }));
}

async function fetchLyric(id) {
  const r = await fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=1`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://music.163.com/' }
  });
  const j = await r.json();
  const lrc = (j.lrc && j.lrc.lyric) || '';
  if (!lrc) throw new Error('该歌曲无歌词或接口受限');
  return lrc;
}

module.exports = { parseLrc, burnLyrics, searchSongs, fetchLyric };