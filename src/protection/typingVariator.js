'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _running = false;

async function simulateComplexTyping(api, threadID, msg) {
  const cfg = global.config?.typingVariator || {};
  if (cfg.enable === false) return;
  const text = typeof msg === 'string' ? msg : (msg?.body || '');
  const base = Math.min(Math.max(text.length * 30, 500), 5000);
  await sleep(randInt(Math.floor(base * 0.7), Math.floor(base * 1.3)));
}

function start(api) { _running = true; }
function stop() { _running = false; }
module.exports = { start, stop, simulateComplexTyping };
