/**
 * Crolo Bot — Human Read Receipt
 * Simulates realistic read receipt delays
 */
"use strict";

let _active = false;
let _api    = null;

function start(api) {
  try { _active = true; _api = api; } catch (_) {}
}

function stop() {
  try { _active = false; _api = null; } catch (_) {}
}

async function markRead(api, threadID) {
  try {
    const delay = 200 + Math.floor(Math.random() * 800);
    await new Promise((r) => setTimeout(r, delay));
    const target = api || _api;
    if (target && typeof target.markAsRead === "function") {
      target.markAsRead(threadID);
    }
  } catch (_) {}
}

function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, markRead, wrapSendMessage, wrapWithTyping, isActive: () => _active };
