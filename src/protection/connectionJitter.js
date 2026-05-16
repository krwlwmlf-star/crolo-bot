/**
 * Crolo Bot — Connection Jitter
 * Adds random micro-delays to connection events
 */
"use strict";

let _active = false;

async function jitter(min = 50, max = 300) {
  const ms = min + Math.floor(Math.random() * (max - min));
  await new Promise((r) => setTimeout(r, ms));
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, jitter, wrapSendMessage, wrapWithTyping, isActive: () => _active };
