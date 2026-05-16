/**
 * Crolo Bot — Behavior Scheduler
 * Schedules random human-like behaviors at varied intervals
 */
"use strict";

let _active  = false;
let _timers  = [];

function scheduleRandom(fn, minMs, maxMs) {
  const delay = minMs + Math.floor(Math.random() * (maxMs - minMs));
  const t = setTimeout(() => {
    try { fn(); } catch (_) {}
    scheduleRandom(fn, minMs, maxMs);
  }, delay);
  _timers.push(t);
}

function start(api) {
  try {
    _active = true;
    if (!api) return;
    // Randomly check presence every 5-15 min
    scheduleRandom(() => {
      try {
        if (typeof api?.getAppState === "function") api.getAppState();
      } catch (_) {}
    }, 5 * 60000, 15 * 60000);
  } catch (_) {}
}

function stop() {
  try {
    _active = false;
    _timers.forEach((t) => clearTimeout(t));
    _timers = [];
  } catch (_) {}
}

function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, wrapSendMessage, wrapWithTyping, isActive: () => _active };
