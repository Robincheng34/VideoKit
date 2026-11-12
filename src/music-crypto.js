const fs = require('fs');
const path = require('path');

let api = null;
function getApi() {
  if (!api) api = require('@clamber_l/crypto/inline');
  return api;
}

const MAGIC_NCM = Buffer.from('CTENFDAM');

function detectExt(m, data) {
  const r = m.detectAudioType(data.subarray(0, 1024));
  const t = r.audioType;
  r.free();
  return t && t !== 'bin' ? t : null;
}

async function decryptFile(file, outDir, onProgress) {
  const m = getApi();
  const buf = fs.readFileSync(file);
  const u8 = new Uint8Array(buf);
  const base = path.basename(file, path.extname(file));
  const ext = path.extname(file).slice(1).toLowerCase();
  if (onProgress) onProgress(10);
  let data = null;
  let outExt = null;

  if (buf.subarray(0, 8).equals(MAGIC_NCM)) {
    const ncm = new m.NCMFile();
    let need = 1024;
    for (;;) {
      const r = ncm.open(u8.subarray(0, Math.min(need, u8.length)));
      if (r === 0) break;
      if (r < 0) { ncm.free(); throw new Error('不是有效的 NCM 文件'); }
      need = r;
      if (need > u8.length) { ncm.free(); throw new Error('NCM 文件头不完整'); }
    }
    const off = ncm.audioOffset;
    data = new Uint8Array(u8.subarray(off));
    ncm.decrypt(data, 0);
    ncm.free();
  } else if (['qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcra', 'bkcmp3', 'bkcflac'].includes(ext)) {
    data = new Uint8Array(u8);
    m.decryptQMC1(data, 0);
  } else if (['mflac', 'mgg', 'mflac0', 'mgg0', 'mogg'].includes(ext)) {
    const footer = m.QMCFooter.parse(u8.subarray(Math.max(0, u8.length - 1024)));
    if (!footer || !footer.ekey) throw new Error('缺少 eKey：该文件需要 QQ 音乐密钥（未内嵌）');
    const size = footer.size;
    const ekey = footer.ekey;
    footer.free();
    data = new Uint8Array(u8.subarray(0, u8.length - size));
    const c = new m.QMC2(ekey);
    c.decrypt(data, 0);
    c.free();
  } else if (['kgm', 'vpr', 'kgma'].includes(ext)) {
    const kg = m.KuGou.from_header(u8.subarray(0, 1024));
    data = new Uint8Array(u8.subarray(1024));
    kg.decrypt(data, 0);
    kg.free();
  } else if (ext === 'kwm') {
    const header = m.KuwoHeader.parse(u8.subarray(0, 1024));
    const c = new m.KWMDecipher(header);
    data = new Uint8Array(u8.subarray(1024));
    c.decrypt(data, 0);
    c.free();
    header.free();
  } else if (ext === 'xm') {
    const xm = m.Xiami.from_header(u8.subarray(0, 1024));
    data = new Uint8Array(u8.subarray(1024));
    xm.decrypt(data);
    xm.free();
  } else if (['mg3d', 'mgg1'].includes(ext)) {
    const mg = m.Migu3D.fromHeader(u8.subarray(0, 1024));
    data = new Uint8Array(u8.subarray(1024));
    mg.decrypt(data, 0);
    mg.free();
  } else {
    throw new Error('不支持的加密格式：.' + ext);
  }

  if (onProgress) onProgress(60);
  outExt = detectExt(m, data);
  if (!outExt) throw new Error('解密后无法识别音频格式（密钥可能不匹配）');
  fs.mkdirSync(outDir, { recursive: true });
  let out = path.join(outDir, `${base}.${outExt}`);
  let i = 1;
  while (fs.existsSync(out)) out = path.join(outDir, `${base} (${i++}).${outExt}`);
  fs.writeFileSync(out, data);
  if (onProgress) onProgress(95);
  return { out, ext: outExt };
}

const SUPPORTED = ['ncm', 'qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcra', 'mflac', 'mgg', 'mflac0', 'mgg0', 'mogg', 'kgm', 'vpr', 'kgma', 'kwm', 'xm', 'mg3d', 'bkcmp3', 'bkcflac'];

module.exports = { decryptFile, SUPPORTED, getApi };