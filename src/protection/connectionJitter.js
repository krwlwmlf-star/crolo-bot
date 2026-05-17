'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _running = false;

async function applyJitter() {
  const cfg = global.config?.connectionJitter || {};
  if (cfg.enable === false || !_running) return;
  const delay = randInt(30, 200);
  await sleep(delay);
}

function start() { _running = true; }
function stop() { _running = false; }
module.exports = { start, stop, applyJitter };
