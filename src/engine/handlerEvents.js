/**
 * Crolo Bot — Event Handler
 * Admin-only: bot only responds to admins, ignores everyone else
 */
"use strict";

const rateLimit = require("../protection/rateLimit");
const { isAdmin } = require("../../database/db");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRole(senderID) {
  const cfg    = global.CroloBot?.config || {};
  const sid    = String(senderID);
  const supers = [...(cfg.superAdminBot || []), cfg.ownerID].filter(Boolean).map(String);
  const admins = (cfg.adminBot || []).map(String);

  if (supers.includes(sid)) return 3;
  if (admins.includes(sid)) return 2;
  if (isAdmin(sid))         return 2;
  return 0;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function buildMessage(api, event) {
  return {
    reply: async (msg, cb) => {
      try {
        const text  = typeof msg === "string" ? msg : msg?.body || "";
        const delay = global.utils?.calcHumanTypingDelay?.(text) || 1200;
        await global.utils?.simulateTyping?.(api, event.threadID, delay);
      } catch (_) {}
      return api.sendMessage(msg, event.threadID, cb);
    },
    unsend: (mid, cb) => { try { api.unsendMessage(mid || event.messageID, cb); } catch (_) {} },
    react:  (emoji, mid, cb) => {
      try { api.setMessageReaction(emoji, mid || event.messageID, cb, true); } catch (_) {}
    },
    send: (msg, tid, cb) => api.sendMessage(msg, tid || event.threadID, cb),
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
async function handlerEvents(api, event) {
  try {
    if (!event) return;

    // Track MQTT activity
    global.lastMqttActivity = Date.now();

    const senderID = String(event.senderID || "");
    const botID    = String(global.CroloBot?.botID || "");

    // Ignore self
    if (senderID === botID) return;

    // ── Admin-Only Guard ────────────────────────────────────────────────────────
    const adminOnlyCfg = global.CroloBot?.config?.adminOnly;
    if (adminOnlyCfg?.enable !== false) {
      const role = getRole(senderID);
      if (role < 2) {
        // Silently ignore non-admins
        return;
      }
    }

    // ── Handle message events ──────────────────────────────────────────────────
    if (event.type === "message" || event.type === "message_reply") {
      await handleMessage(api, event);
    }

  } catch (err) {
    global.log?.error?.("HANDLER", err.message);
  }
}

async function handleMessage(api, event) {
  try {
    const senderID = String(event.senderID);
    const body     = (event.body || "").trim();

    if (!body) return;

    // Rate limit check
    if (rateLimit.isLimited(senderID)) return;

    // Simulate read receipt
    try {
      const readDelay = 200 + Math.floor(Math.random() * 600);
      await sleep(readDelay);
      if (typeof api.markAsRead === "function") {
        api.markAsRead(event.threadID);
      }
    } catch (_) {}

    const prefix  = global.CroloBot?.config?.prefix || "/";
    const commands = global.CroloBot?.commands;

    if (!body.startsWith(prefix)) return;

    const args    = body.slice(prefix.length).trim().split(/\s+/);
    const cmdName = args.shift()?.toLowerCase();
    if (!cmdName) return;

    const cmd = commands?.get(cmdName);
    if (!cmd || typeof cmd.onStart !== "function") return;

    const role    = getRole(senderID);
    const minRole = cmd.config?.role || 0;

    if (role < minRole) {
      return buildMessage(api, event).reply("⛔ You don't have permission to use this command.");
    }

    const message = buildMessage(api, event);

    await cmd.onStart({
      api,
      event,
      args,
      message,
      senderID,
      threadID: event.threadID,
      role,
      prefix,
    });

  } catch (err) {
    global.log?.error?.("HANDLER", `handleMessage error: ${err.message}`);
    try { api.sendMessage(`❌ Error: ${err.message}`, event.threadID); } catch (_) {}
  }
}

module.exports = handlerEvents;
