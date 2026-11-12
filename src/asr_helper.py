import sys
import json
import argparse
import subprocess
import os
import glob

# 让 ctranslate2 能找到 pip 安装的 NVIDIA CUDA DLL
for d in glob.glob(os.path.join(os.path.dirname(os.__file__), 'site-packages', 'nvidia', '*', 'bin')):
    os.environ['PATH'] = d + os.pathsep + os.environ.get('PATH', '')


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def load_audio(path):
    import numpy as np
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path,
           '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError('ffmpeg 解码失败：%s' % p.stderr.decode('utf8', 'ignore')[-300:])
    return np.frombuffer(p.stdout, dtype=np.float32)


p = argparse.ArgumentParser()
p.add_argument('input')
p.add_argument('output')
p.add_argument('--model', default='small')
p.add_argument('--models-dir', default='')
p.add_argument('--language', default='')
p.add_argument('--device', default='auto')
args = p.parse_args()

emit({'type': 'download', 'model': args.model})
from faster_whisper import WhisperModel

device = args.device
if device == 'auto':
    device = 'cuda'
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() == 0:
            device = 'cpu'
    except Exception:
        device = 'cpu'
compute = 'float16' if device == 'cuda' else 'int8'
try:
    model = WhisperModel(args.model, device=device, compute_type=compute,
                         download_root=args.models_dir or None)
except Exception as e:
    if device == 'cuda':
        emit({'type': 'warn', 'msg': 'CUDA 不可用，回退 CPU：%s' % e})
        device, compute = 'cpu', 'int8'
        model = WhisperModel(args.model, device=device, compute_type=compute,
                             download_root=args.models_dir or None)
    else:
        raise
emit({'type': 'ready', 'device': device, 'model': args.model})

audio = load_audio(args.input)


def run_transcribe(mdl):
    segs, inf = mdl.transcribe(audio, language=args.language or None,
                               vad_filter=True, beam_size=5)
    d = inf.duration or (len(audio) / 16000.0)
    emit({'type': 'info', 'language': inf.language, 'duration': d})
    out = []
    for s in segs:
        out.append({'start': s.start, 'end': s.end, 'text': s.text.strip()})
        if d > 0:
            emit({'type': 'progress', 'pct': min(99.0, s.end / d * 100)})
    return out, d


try:
    entries, dur = run_transcribe(model)
except RuntimeError as e:
    msg = str(e).lower()
    if device == 'cuda' and ('cublas' in msg or 'cudnn' in msg or 'cuda' in msg):
        emit({'type': 'warn', 'msg': 'CUDA 库缺失，回退 CPU：%s' % e})
        device, compute = 'cpu', 'int8'
        model = WhisperModel(args.model, device=device, compute_type=compute,
                             download_root=args.models_dir or None)
        entries, dur = run_transcribe(model)
    else:
        raise


def ts(t):
    ms = int(round(t * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, mm = divmod(rem, 1000)
    return '%02d:%02d:%02d,%03d' % (h, m, s, mm)


with open(args.output, 'w', encoding='utf-8') as f:
    for i, e in enumerate(entries, 1):
        f.write('%d\n%s --> %s\n%s\n\n' % (i, ts(e['start']), ts(e['end']), e['text']))
emit({'type': 'done', 'path': args.output, 'count': len(entries)})