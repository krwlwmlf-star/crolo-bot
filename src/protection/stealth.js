'use strict';
const axios = require('axios');

function randMs(minMin, maxMin) { return Math.floor(Math.random() * ((maxMin - minMin) * 60_000 + 1)) + minMin * 60_000; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UA_POOL = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
];
let _uaIdx = randInt(0, UA_POOL.length - 1);
function getCurrentUA() { return UA_POOL[_uaIdx]; }
function rotateUA() { _uaIdx = (_uaIdx + randInt(1, UA_POOL.length - 1)) % UA_POOL.length; }

let running = false;
let _api = null;
const _timers = [];

function addTimer(fn, ms) {
  const id = setTimeout(() => { const i = _timers.indexOf(id); if (i !== -1) _timers.splice(i, 1); fn(); }, ms);
  _timers.push(id); return id;
}
function clearAll() { _timers.forEach(id => clearTimeout(id)); _timers.length = 0; }

function localHour() {
  const tz = global.config?.timezone || 'Africa/Algiers';
  try { return parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }), 10); }
  catch (_) { return new Date().getHours(); }
}

function isSleepHour() {
  const cfg = global.config?.stealth || {};
  const start = cfg.sleepHourStart ?? 1, end = cfg.sleepHourEnd ?? 7;
  const h = localHour();
  return start < end ? (h >= start && h < end) : (h >= start || h < end);
}

function cookieStr(api) {
  try {
    const st = api.getAppState();
    if (!st?.length) return null;
    return st.map(c => `${c.key}=${c.value}`).join('; ');
  } catch (_) { return null; }
}

async function doStealth(api) {
  const cfg = global.config?.stealth || {};
  if (cfg.enable === false) return;
  if (isSleepHour()) { addTimer(() => doStealth(api), randMs(20, 40)); return; }
  const cs = cookieStr(api);
  if (!cs) { addTimer(() => doStealth(api), randMs(5, 10)); return; }
  rotateUA();
  try {
    await axios.head('https://mbasic.facebook.com/', {
      headers: { cookie: cs, 'user-agent': getCurrentUA() },
      timeout: 10000, validateStatus: null, maxRedirects: 2,
    });
  } catch (_) {}
  addTimer(() => doStealth(api), randMs(8, 20));
}

function start(api) {
  const cfg = global.config?.stealth || {};
  if (cfg.enable === false) return;
  if (running) return;
  running = true; _api = api;
  console.log('[STEALTH] Started');
  addTimer(() => doStealth(api), randMs(5, 15));
}

function stop() {
  running = false; _api = null; clearAll();
}

module.exports = { start, stop, isRunning: () => running, getCurrentUA };
