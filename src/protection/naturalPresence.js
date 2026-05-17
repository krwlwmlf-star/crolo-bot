'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

let _running = false; const _timers = [];
function addTimer(fn, ms) { const id = setTimeout(fn, ms); _timers.push(id); return id; }
function clearAll() { _timers.forEach(id => clearTimeout(id)); _timers.length = 0; }

async function doPresence(api) {
  const cfg = global.config?.stealth || {};
  if (cfg.enable === false || !_running) return;
  try {
    if (api && typeof api.setOptions === 'function') api.setOptions({ online: true });
  } catch (_) {}
  addTimer(() => doPresence(api), randInt(5, 15) * 60000);
}

function start(api) { if (_running) return; _running = true; addTimer(() => doPresence(api), randInt(2, 8) * 60000); }
function stop() { _running = false; clearAll(); }
module.exports = { start, stop, isRunning: () => _running };
