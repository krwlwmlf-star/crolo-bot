/**
 * Crolo Bot — Scroll Simulator
 * Simulates thread scrolling to appear human
 */
"use strict";

let _active = false;

async function simulateScroll(api, threadID) {
  try {
    const delay = 200 + Math.floor(Math.random() * 600);
    await new Promise((r) => setTimeout(r, delay));
  } catch (_) {}
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, simulateScroll, wrapSendMessage, wrapWithTyping, isActive: () => _active };
