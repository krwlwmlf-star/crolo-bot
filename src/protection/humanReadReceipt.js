'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function calcReadTime(text) {
  const len = String(text || '').length;
  if (len === 0) return randInt(800, 2000);
  return Math.round(Math.min(Math.max(len * 50, 1500), 12000) * (0.70 + Math.random() * 0.60));
}

function wrapMarkAsRead(api) {
  if (api.__readReceiptWrapped) return;
  api.__readReceiptWrapped = true;
  const _orig = api.markAsRead ? api.markAsRead.bind(api) : null;
  if (!_orig) return;
  api.markAsRead = async function(threadID, callback) {
    const cfg = global.config?.humanReadReceipt || {};
    if (cfg.enable === false) return _orig(threadID, callback);
    const delay = randInt(cfg.minDelayMs ?? 1500, cfg.maxDelayMs ?? 8000);
    await sleep(delay);
    return _orig(threadID, callback);
  };
}

let _running = false;

function start(api) {
  const cfg = global.config?.humanReadReceipt || {};
  if (cfg.enable === false || _running) return;
  _running = true;
  wrapMarkAsRead(api);
}

function stop() { _running = false; }

module.exports = { start, stop, wrapMarkAsRead, calcReadTime, isRunning: () => _running };
