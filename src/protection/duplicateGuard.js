'use strict';
const crypto = require('crypto');
const _sentCache = new Map();
let _running = false;

function hashMsg(msg) {
  const text = typeof msg === 'string' ? msg : (msg?.body || msg?.message || JSON.stringify(msg) || '');
  return crypto.createHash('md5').update(text.slice(0, 500)).digest('hex').slice(0, 16);
}

function isDuplicate(threadID, msg, windowMs = 8000) {
  const h = hashMsg(msg), now = Date.now(), key = String(threadID);
  if (!_sentCache.has(key)) _sentCache.set(key, []);
  const recent = _sentCache.get(key).filter(e => now - e.ts < windowMs);
  _sentCache.set(key, recent);
  const dup = recent.some(e => e.hash === h);
  if (!dup) recent.push({ hash: h, ts: now });
  return dup;
}

function wrapSendMessage(api) {
  if (api.__dedupWrapped) return;
  api.__dedupWrapped = true;
  const _orig = api.sendMessage.bind(api);
  api.sendMessage = async function(msg, threadID, callback, messageID) {
    const cfg = global.config?.duplicateGuard || {};
    const windowMs = (cfg.windowSeconds ?? 8) * 1000;
    if (_running && isDuplicate(threadID, msg, windowMs)) { if (typeof callback === 'function') callback(null); return; }
    return _orig(msg, threadID, callback, messageID);
  };
}

function start(api) { if (_running) return; _running = true; wrapSendMessage(api); }
function stop() { _running = false; }
module.exports = { start, stop, isDuplicate };
