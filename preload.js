const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  filePath: f => webUtils.getPathForFile(f),
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    onMaximized: cb => ipcRenderer.on('win:maximized', (_e, v) => cb(v))
  },
  trayIcon: dataUrl => ipcRenderer.send('tray:icon', dataUrl),
  tools: { check: () => ipcRenderer.invoke('tools:check') },
  env: { check: () => ipcRenderer.invoke('env:check') },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: patch => ipcRenderer.invoke('settings:set', patch)
  },
  memory: {
    get: () => ipcRenderer.invoke('memory:get'),
    record: (group, data) => ipcRenderer.invoke('memory:record', group, data),
    clear: group => ipcRenderer.invoke('memory:clear', group)
  },
  theme: {
    current: () => ipcRenderer.invoke('theme:current'),
    onChanged: cb => ipcRenderer.on('theme:changed', (_e, dark) => cb(dark))
  },
  dialog: {
    file: filters => ipcRenderer.invoke('dialog:file', filters),
    files: filters => ipcRenderer.invoke('dialog:files', filters),
    dir: () => ipcRenderer.invoke('dialog:dir')
  },
  music: {
    decrypt: opts => ipcRenderer.invoke('music:decrypt', opts)
  },
  lyrics: {
    search: q => ipcRenderer.invoke('lyrics:search', q),
    fetch: id => ipcRenderer.invoke('lyrics:fetch', id),
    burn: opts => ipcRenderer.invoke('lyrics:burn', opts)
  },
  shell: {
    open: p => ipcRenderer.invoke('shell:open', p),
    reveal: p => ipcRenderer.invoke('shell:reveal', p),
    external: u => ipcRenderer.invoke('shell:external', u)
  },
  clipboard: { write: t => ipcRenderer.invoke('clipboard:write', t) },
  fs: { readText: f => ipcRenderer.invoke('fs:readText', f) },
  media: {
    probe: f => ipcRenderer.invoke('media:probe', f),
    frame: (f, t) => ipcRenderer.invoke('media:frame', f, t)
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    info: f => ipcRenderer.invoke('library:info', f),
    thumb: f => ipcRenderer.invoke('library:thumb', f),
    delete: f => ipcRenderer.invoke('library:delete', f)
  },
  cookies: {
    login: url => ipcRenderer.invoke('cookies:login', url),
    import: (browser, force) => ipcRenderer.invoke('cookies:import', browser, force),
    clear: () => ipcRenderer.invoke('cookies:clear'),
    status: () => ipcRenderer.invoke('cookies:status'),
    onChanged: cb => ipcRenderer.on('cookies:changed', (_e, s) => cb(s)),
    onSaved: cb => ipcRenderer.on('cookies:saved', (_e, d) => cb(d))
  },
  parse: url => ipcRenderer.invoke('parse:url', url),
  download: opts => ipcRenderer.invoke('download:start', opts),
  convert: opts => ipcRenderer.invoke('convert:start', opts),
  extract: opts => ipcRenderer.invoke('extract:start', opts),
  watermark: opts => ipcRenderer.invoke('watermark:start', opts),
  subtitle: {
    load: f => ipcRenderer.invoke('subtitle:load', f),
    search: opts => ipcRenderer.invoke('subtitle:search', opts),
    fetch: url => ipcRenderer.invoke('subtitle:fetch', url),
    asr: opts => ipcRenderer.invoke('subtitle:asr', opts),
    apply: opts => ipcRenderer.invoke('subtitle:apply', opts)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    pause: id => ipcRenderer.invoke('task:pause', id),
    resume: id => ipcRenderer.invoke('task:resume', id),
    pauseAll: () => ipcRenderer.invoke('tasks:pauseAll'),
    resumeAll: () => ipcRenderer.invoke('tasks:resumeAll'),
    cancel: id => ipcRenderer.invoke('task:cancel', id),
    remove: id => ipcRenderer.invoke('task:remove', id),
    retry: id => ipcRenderer.invoke('task:retry', id),
    clear: () => ipcRenderer.invoke('tasks:clear'),
    context: (id, x, y) => ipcRenderer.send('task:context', id, x, y),
    onUpdate: cb => ipcRenderer.on('task:update', (_e, t) => cb(t)),
    onRemove: cb => ipcRenderer.on('task:remove', (_e, id) => cb(id)),
    onQualityDialog: cb => ipcRenderer.on('dialog:quality', (_e, id) => cb(id)),
    onDeleteDialog: cb => ipcRenderer.on('dialog:delete-task', (_e, id) => cb(id))
  }
});