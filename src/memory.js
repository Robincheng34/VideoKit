const fs = require('fs');
const path = require('path');

let store = null;
let memFile = null;

function ensure(app) {
  if (!memFile) memFile = path.join(app.getPath('userData'), 'memory.json');
}

function load(app) {
  ensure(app);
  try {
    store = JSON.parse(fs.readFileSync(memFile, 'utf8'));
    if (!store || typeof store !== 'object') store = {};
  } catch {
    store = {};
  }
  return store;
}

function save() {
  if (!memFile) return;
  try { fs.writeFileSync(memFile, JSON.stringify(store, null, 2)); } catch {}
}

function getAll() {
  return { ...(store || {}) };
}

/** 记录某一功能页的参数（浅合并到该页分组） */
function record(group, data) {
  if (!store) store = {};
  store[group] = { ...(store[group] || {}), ...data, _ts: Date.now() };
  save();
}

function clear(group) {
  if (!store) return;
  if (group) delete store[group];
  else store = {};
  save();
}

module.exports = { load, save, getAll, record, clear };
