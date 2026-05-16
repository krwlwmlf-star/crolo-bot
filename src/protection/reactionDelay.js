/**
 * Crolo Bot — Reaction Delay
 * Adds human-like delay before sending reactions
 */
"use strict";

let _active = false;

async function delayedReact(api, emoji, messageID, threadID) {
  try {
    const delay = 400 + Math.floor(Math.random() * 900);
    await new Promise((r) => setTimeout(r, delay));
    if (typeof api?.setMessageReaction === "function") {
      api.setMessageReaction(emoji, messageID, () => {}, true);
    }
  } catch (_) {}
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, delayedReact, wrapSendMessage, wrapWithTyping, isActive: () => _active };
