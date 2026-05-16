/**
 * Crolo Bot — Human Typing Simulator
 * Simulates realistic human typing delays and indicators
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

/**
 * Send typing indicator for a calculated duration based on message length
 */
async function sendTyping(api, threadID, text = "") {
  try {
    const fca = require("../../Djamel-fca");
    const delay = fca.calcTypingDelay(text);
    await fca.simulateTyping(api || _api, threadID, delay);
  } catch (_) {}
}

function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, sendTyping, wrapSendMessage, wrapWithTyping, isActive: () => _active };
