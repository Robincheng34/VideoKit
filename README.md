# VideoKit 视频工具箱

Windows 桌面视频 / 音乐工具箱（Electron + Fluent Design 深色护眼界面）。全本地处理，不上传任何文件。

## 功能

- **视频解析下载**：yt-dlp 支持 1000+ 站点；清晰度 / 编码 / 帧率 / 预估大小选择；字幕下载；分片并发（1–16）与任务并发（1–8）；限速；仅有线网络开关
- **任务队列**：暂停 / 继续 / 重试 / 排序 / 搜索 / 原生右键菜单；托盘最小化后台下载；失败原因行内显示 + 全量日志
- **格式转换**：MP4 / MKV / WebM / MOV / GIF / MP3 / AAC / M4A / **FLAC / WAV / AIFF / ALAC**；采样率 / 位深可选；GPU（NVENC）加速，失败自动回退 CPU
- **视音频分离**：提取音频 / 无声视频 / 同时分离
- **水印清除**：预览帧框选多区域；智能修补 / 模糊遮盖 / 裁剪；GPU 编码；完成后自动全解码校验可播放性
- **字幕添加**：语音识别生成（faster-whisper 本地离线，GPU 可选）/ 导入 srt·vtt·ass / 在线搜索（OpenSubtitles，哈希精确匹配）；编辑与时间偏移；软封装 / 硬烧录
- **音乐解密**：网易 ncm / QQ qmc·mflac·mgg / 酷狗 kgm·vpr / 酷我 kwm / 虾米 xm / 咪咕 mg3d（unlock-music WASM 核心）
- **歌词烧录**：在线搜索（网易云）/ 本地 lrc / 粘贴；mp3 ID3 USLT+SYLT、flac/ogg LYRICS、m4a ©lyr、wav/aiff ID3

## 安装

从 [Releases](../../releases) 下载：

- `VideoKit Setup x.y.z.exe` — 安装版（可选安装目录）
- `VideoKit-x.y.z-portable.exe` — 便携版，双击即用

依赖（自动检测，也可在 设置→高级 指定路径）：

- [FFmpeg](https://ffmpeg.org/)（含 ffprobe）
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)（`pip install yt-dlp`；YouTube 高清晰度需 `yt-dlp[default]` 与 Node ≥ 22）
- Python 3 + [faster-whisper](https://github.com/SYSTRAN/faster-whisper)（仅语音识别需要）
- Chrome / Edge（仅在线字幕搜索需要，后台会话自动管理）

## 构建

```bash
npm install
npm start          # 开发运行
npm run dist       # 打包 Windows 安装包 + 便携版（输出 release/）
```

## 说明

- 请仅下载 / 解密您拥有版权或已获授权的内容，遵守各平台服务条款
- 未代码签名，首次运行 SmartScreen 提示属正常
- 日志：`%APPDATA%\VideoKit\videokit.log`

## 致谢

[yt-dlp](https://github.com/yt-dlp/yt-dlp) · [FFmpeg](https://ffmpeg.org/) · [unlock-music](https://github.com/unlock-music/unlock-music) · [faster-whisper](https://github.com/SYSTRAN/faster-whisper) · [node-id3](https://github.com/Zazama/node-id3) · [Electron](https://www.electronjs.org/)

## 许可

MIT