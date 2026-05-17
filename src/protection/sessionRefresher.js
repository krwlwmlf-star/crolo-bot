'use strict';
const axios = require('axios');
const fs    = require('fs-extra');
const path  = require('path');
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let _running = false; const _timers = [];
function addTimer(fn, ms) { const id = setTimeout(fn, ms); _timers.push(id); return id; }
function clearAll() { _timers.forEach(id => clearTimeout(id)); _timers.length = 0; }

async function doRefresh(api) {
  if (!_running) return;
  try {
    const st = api.getAppState();
    if (!st?.length) return;
    const cookieStr = st.map(c => `${c.key}=${c.value}`).join('; ');
    const ua = global.config?.userAgent || 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';
    await axios.head('https://m.facebook.com/home.php?_fb_noscript=1', {
      headers: { cookie: cookieStr, 'user-agent': ua }, timeout: 10000, validateStatus: null,
    });
    // Save refreshed appState
    const ACCOUNT_PATH = path.join(process.cwd(), 'account.txt');
    global._selfWrite = true;
    fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(st, null, 2), 'utf8');
    setTimeout(() => { global._selfWrite = false; }, 6000);
  } catch (_) {}
  addTimer(() => doRefresh(api), randInt(30, 60) * 60000);
}

function start(api) { if (_running) return; _running = true; addTimer(() => doRefresh(api), randInt(10, 20) * 60000); }
function stop() { _running = false; clearAll(); }
module.exports = { start, stop };
