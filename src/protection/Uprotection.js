/**
 * Crolo Bot — Universal Protection Layer
 * Orchestrates all protection modules
 */
"use strict";

const humanTyping      = require("./humanTyping");
const humanReadReceipt = require("./humanReadReceipt");
const naturalPresence  = require("./naturalPresence");
const outgoingThrottle = require("./outgoingThrottle");
const scrollSimulator  = require("./scrollSimulator");
const antiDetection    = require("./antiDetection");
const duplicateGuard   = require("./duplicateGuard");
const behaviorScheduler= require("./behaviorScheduler");
const connectionJitter = require("./connectionJitter");
const sessionRefresher = require("./sessionRefresher");
const reactionDelay    = require("./reactionDelay");
const typingVariator   = require("./typingVariator");
const stealth          = require("./stealth");

let _active = false;

function startAll(api) {
  try {
    _active = true;
    [
      humanTyping, humanReadReceipt, naturalPresence, outgoingThrottle,
      scrollSimulator, antiDetection, duplicateGuard, behaviorScheduler,
      connectionJitter, sessionRefresher, reactionDelay, typingVariator, stealth,
    ].forEach((mod) => {
      try { mod.start?.(api); } catch (_) {}
    });
    global.log?.success?.("UPROTECT", "All protection layers active");
  } catch (_) {}
}

function stopAll() {
  try {
    _active = false;
    [
      humanTyping, humanReadReceipt, naturalPresence, outgoingThrottle,
      scrollSimulator, antiDetection, duplicateGuard, behaviorScheduler,
      connectionJitter, sessionRefresher, reactionDelay, typingVariator, stealth,
    ].forEach((mod) => {
      try { mod.stop?.(); } catch (_) {}
    });
  } catch (_) {}
}

function start(api) { startAll(api); }
function stop()     { stopAll(); }
function wrapSendMessage(api) { startAll(api); }
function wrapWithTyping(api)  { startAll(api); }

module.exports = {
  start, stop, startAll, stopAll,
  wrapSendMessage, wrapWithTyping,
  isActive: () => _active,
  modules: {
    humanTyping, humanReadReceipt, naturalPresence, outgoingThrottle,
    scrollSimulator, antiDetection, duplicateGuard, behaviorScheduler,
    connectionJitter, sessionRefresher, reactionDelay, typingVariator, stealth,
  },
};
