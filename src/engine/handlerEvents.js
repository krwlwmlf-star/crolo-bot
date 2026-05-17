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

// ─── Auto-feature Handlers ────────────────────────────────────────────────────

async function handleLockName(api, event) {
  const locked = global.CroloBot?.locked?.names;
  if (!locked) return;
  const threadID  = String(event.threadID);
  const lockedName = locked.get(threadID);
  if (!lockedName) return;
  // event.logMessageData.name is the new name that was set
  const newName = event.logMessageData?.name || event.snippet || "";
  if (newName && newName !== lockedName) {
    try {
      await sleep(1000);
      await new Promise((res, rej) =>
        api.setTitle(lockedName, threadID, (err) => err ? rej(err) : res())
      );
    } catch (_) {}
  }
}

async function handleLockNick(api, event) {
  const locked = global.CroloBot?.locked?.nicknames;
  if (!locked) return;
  const threadID = String(event.threadID);
  const config   = locked.get(threadID);
  if (!config) return;
  // Someone changed a nickname — restore it
  const userID = event.logMessageData?.participant_id
    || event.logMessageData?.user_id
    || null;
  if (!userID) return;
  try {
    await sleep(1500);
    await new Promise((res, rej) =>
      api.changeNickname(config.nick, threadID, userID, (err) => err ? rej(err) : res())
    );
  } catch (_) {}
}

async function handleAutoRejoin(api, event) {
  const ar = global.CroloBot?.locked?.autoRejoin;
  if (!ar) return;
  const threadID = String(event.threadID);
  if (!ar.has(threadID)) return;
  // Get the user who left
  const leftUserID = event.logMessageData?.leftParticipantFbId
    || (event.logMessageData?.participant_ids || [])[0]
    || null;
  if (!leftUserID) return;
  const botID = String(global.CroloBot?.botID || "");
  if (String(leftUserID) === botID) return;
  try {
    await sleep(2000);
    await new Promise((res, rej) =>
      api.addUserToGroup(leftUserID, threadID, (err) => err ? rej(err) : res())
    );
  } catch (_) {}
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

    // ── Group event handlers (no admin check needed) ────────────────────────────
    if (event.type === "event") {
      const logType = event.logMessageType || "";

      if (logType === "log:thread-name") {
        await handleLockName(api, event);
      } else if (logType === "log:user-nickname") {
        await handleLockNick(api, event);
      } else if (logType === "log:unsubscribe") {
        await handleAutoRejoin(api, event);
      }
      return;
    }

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
