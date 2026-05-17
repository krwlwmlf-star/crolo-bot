'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
let _running = false;

function start() { _running = true; }
function stop() { _running = false; }
function calcResponseDelay(incomingText) {
  const cfg = global.config?.behaviorScheduler || {};
  if (cfg.enable === false) return 0;
  const len = String(incomingText || '').length;
  const base = randInt(800, 4000);
  const readDelay = Math.min(len * 40, 5000);
  return base + readDelay;
}

module.exports = { start, stop, calcResponseDelay };
