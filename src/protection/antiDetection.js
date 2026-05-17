'use strict';
const DEVICE_PROFILES = [
  { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36', platform: 'Android' },
  { ua: 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36', platform: 'Android' },
  { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone' },
];
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
let _idx = 0; let _running = false;

function getCurrentProfile() { return DEVICE_PROFILES[_idx]; }
function rotateProfile() { _idx = (_idx + 1) % DEVICE_PROFILES.length; }

let _timer = null;
function start() {
  if (_running) return; _running = true;
  _timer = setInterval(rotateProfile, randInt(25, 45) * 60000);
}
function stop() { if (_timer) { clearInterval(_timer); _timer = null; } _running = false; }
module.exports = { start, stop, isRunning: () => _running, getCurrentProfile };
