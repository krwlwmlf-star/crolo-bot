/**
 * Crolo Bot — Anti-Detection
 * Randomizes request patterns to avoid bot detection
 */
"use strict";

let _active = false;

function randomDelay(min = 100, max = 500) {
  return new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * (max - min))));
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, randomDelay, wrapSendMessage, wrapWithTyping, isActive: () => _active };
