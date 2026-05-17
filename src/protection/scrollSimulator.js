'use strict';
const axios = require('axios');
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

let _running = false; const _timers = [];
function addTimer(fn, ms) { const id = setTimeout(fn, ms); _timers.push(id); return id; }
function clearAll() { _timers.forEach(id => clearTimeout(id)); _timers.length = 0; }

async function doScroll(api) {
  const cfg = global.config?.stealth || {};
  if (cfg.enable === false || !_running) return;
  try {
    const st = api.getAppState();
    if (!st?.length) return;
    const cookieStr = st.map(c => `${c.key}=${c.value}`).join('; ');
    const ua = global.config?.userAgent || 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';
    await axios.head('https://m.facebook.com/messages/', { headers: { cookie: cookieStr, 'user-agent': ua }, timeout: 8000, validateStatus: null });
  } catch (_) {}
  addTimer(() => doScroll(api), randInt(15, 35) * 60000);
}

function start(api) { if (_running) return; _running = true; addTimer(() => doScroll(api), randInt(5, 12) * 60000); }
function stop() { _running = false; clearAll(); }
module.exports = { start, stop };
