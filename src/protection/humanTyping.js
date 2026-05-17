"use strict";

const sleep = ms => new Promise(r => setTimeout(r, ms));
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function extractText(msg) {
  if (!msg) return "";
  if (typeof msg === "string") return msg;
  if (typeof msg === "object") return msg.body || msg.message || msg.text || "";
  return "";
}

function calcTypingDelay(text) {
  const len = (text || "").length;
  if (len === 0) return randInt(600, 1200);
  const base = Math.min(Math.max(len * 35, 700), 7000);
  return Math.round(base * (0.75 + Math.random() * 0.50));
}

async function sendTypingIndicator(api, threadID) {
  try {
    await new Promise((resolve) => {
      const result = api.sendTypingIndicator(threadID, () => resolve());
      if (result && typeof result.then === "function") result.then(resolve).catch(resolve);
      setTimeout(resolve, 500);
    });
  } catch (_) {}
}

async function simulateTyping(api, threadID, msg) {
  const cfg = global.config?.humanTyping || {};
  if (cfg.enable === false) return;
  const text = extractText(msg);
  const delay = calcTypingDelay(text);
  await sendTypingIndicator(api, threadID);
  await sleep(delay);
  await sleep(randInt(150, 450));
}

function wrapWithTyping(api) {
  if (api.__typingWrapped) return;
  api.__typingWrapped = true;
  const _orig = api.sendMessage.bind(api);
  api.sendMessage = async function(msg, threadID, callback, messageID) {
    try { await simulateTyping(api, threadID, msg); } catch (_) {}
    return _orig(msg, threadID, callback, messageID);
  };
  console.log("[HUMAN_TYPING] ✅ api.sendMessage wrapped — typing active");
}

module.exports = { wrapWithTyping, simulateTyping, calcTypingDelay };
