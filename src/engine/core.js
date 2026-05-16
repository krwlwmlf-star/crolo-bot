/**
 * Crolo Bot — Core Globals
 */
"use strict";

const path = require("path");

function initGlobals(config) {
  global.CroloBot = {
    startTime:      Date.now(),
    config,
    commands:       new Map(),
    aliases:        new Map(),
    onChat:         [],
    onReply:        new Map(),
    onReaction:     new Map(),
    onEvent:        [],
    fcaApi:         null,
    botID:          null,
    reLoginBot:     () => {},
    _replyTimeout:  30 * 60 * 1000,
  };

  const fca = require("../../Djamel-fca");
  global.utils = {
    calcHumanTypingDelay: fca.calcTypingDelay,
    simulateTyping:       fca.simulateTyping,
    simulateReadReceipt:  fca.simulateReadReceipt,
    buildReplyHelper:     fca.buildReplyHelper,
    sendMessageHuman:     fca.sendMessageHuman,
    log:                  require("./logger"),
    sleep:   (ms) => new Promise((r) => setTimeout(r, ms)),
    isNum:   (v)  => !isNaN(parseFloat(v)) && isFinite(v),
    getPrefix: () => global.CroloBot?.config?.prefix || "/",
    rand:    (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
  };

  global.log = require("./logger");
}

module.exports = { initGlobals };
