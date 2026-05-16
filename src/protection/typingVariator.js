/**
 * Crolo Bot — Typing Variator
 * Varies typing speed to simulate human behavior
 */
"use strict";

let _active = false;

function calcVariedDelay(text = "") {
  const base = text.length * (45 + Math.floor(Math.random() * 25));
  const jitter = Math.floor(Math.random() * 500) - 250;
  return Math.max(600, Math.min(base + jitter, 7000));
}

function start(api) { try { _active = true; } catch (_) {} }
function stop()     { try { _active = false; } catch (_) {} }
function wrapSendMessage(api) { try { start(api); } catch (_) {} }
function wrapWithTyping(api)  { try { start(api); } catch (_) {} }

module.exports = { start, stop, calcVariedDelay, wrapSendMessage, wrapWithTyping, isActive: () => _active };
