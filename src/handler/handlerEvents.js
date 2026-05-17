"use strict";

const chalk  = require("chalk");
const moment = require("moment-timezone");
const { getOrCreateUser, getOrCreateThread, logCommand } = require("../utils/database");

// ─── Anti-Spam ────────────────────────────────────────────────────────────────
const _spamMap   = new Map();
const _warned    = new Set();
const SPAM_LIMIT = 8;
const SPAM_WIN   = 10000;

function checkSpam(senderID) {
  const now = Date.now();
  let entry = _spamMap.get(senderID);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + SPAM_WIN };
    _warned.delete(senderID);
  }
  entry.count++;
  _spamMap.set(senderID, entry);
  return { exceeded: entry.count > SPAM_LIMIT, warned: _warned.has(senderID), setWarn: () => _warned.add(senderID) };
}

// ─── Name Cache ───────────────────────────────────────────────────────────────
const _nc = { u: {}, t: {} };
global._nameCache = _nc;

async function resolveUser(api, uid) {
  if (_nc.u[uid]) return _nc.u[uid];
  try {
    const info = await new Promise((res, rej) =>
      api.getUserInfo(uid, (e, d) => e ? rej(e) : res(d || {})));
    _nc.u[uid] = info[uid]?.name || String(uid);
  } catch { _nc.u[uid] = String(uid); }
  return _nc.u[uid];
}

async function resolveThread(api, tid) {
  if (_nc.t[tid]) return _nc.t[tid];
  try {
    const info = await new Promise((res, rej) =>
      api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d || {})));
    _nc.t[tid] = info?.threadName || String(tid);
  } catch { _nc.t[tid] = String(tid); }
  return _nc.t[tid];
}

// ─── Logger ───────────────────────────────────────────────────────────────────
const ts = () => moment().tz(global.config?.timezone || "Africa/Algiers").format("HH:mm:ss");

function logMsg(senderName, threadName, body, isGroup, isCmd) {
  const icon  = isGroup ? chalk.blue("👥") : chalk.green("💬");
  const who   = chalk.bold.cyan(senderName);
  const where = isGroup ? chalk.bold.blue(`[${threadName}]`) : chalk.bold.green("DM");
  const prefix = isCmd ? chalk.magenta("⚡CMD ") : "";
  console.log(`${chalk.gray(ts())} ${icon} ${where} ${chalk.gray("←")} ${who}: ${prefix}${chalk.white(String(body||"").slice(0,120))}`);
}

function logEvent(type, threadName) {
  console.log(`${chalk.gray(ts())} ${chalk.yellow("⚡")} ${chalk.yellow(type)} @ ${chalk.cyan(threadName)}`);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async function handlerEvents(api, event, commands) {
  if (!event) return;

  commands = commands || global.commands;
  const prefix = global.commandPrefix || "/";
  const config = global.config || {};

  global._lastActivity     = Date.now();
  global._lastMqttActivity = Date.now();

  try { require("../protection/mqttHealthCheck").onMqttActivity(); } catch (_) {}

  // ══ MESSAGE ══════════════════════════════════════════════════════════════════
  if (event.type === "message" || event.type === "message_reply") {
    const { body = "", threadID, senderID, isGroup, messageID } = event;

    if (senderID === api.getCurrentUserID()) return;

    const _isOwner = global.isOwner ? global.isOwner(senderID) : String(senderID) === String(global.ownerID);
    const _isAdmin = global.isAdmin ? global.isAdmin(senderID) : _isOwner || (config.adminIDs||[]).map(String).includes(String(senderID));

    const [senderName, threadName] = await Promise.all([
      resolveUser(api, senderID),
      isGroup ? resolveThread(api, threadID) : Promise.resolve("DM"),
    ]);

    const isCmd = body.startsWith(prefix);
    logMsg(senderName, threadName, body, isGroup, isCmd);

    Promise.all([
      getOrCreateUser(senderID, senderName).catch(() => {}),
      isGroup ? getOrCreateThread(threadID, threadName).catch(() => {}) : Promise.resolve(),
    ]);

    if (!isCmd) return;

    // Lock check
    const _locked = global._lockedThreads || new Set();
    if ((global._globalLock || _locked.has(threadID)) && !_isAdmin) return;

    const args    = body.slice(prefix.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();
    const cmd     = commands.get(cmdName);
    if (!cmd) return;

    // Permission checks
    if (cmd.config.ownerOnly && !_isOwner)
      return api.sendMessage("❌ هذا الأمر للمالك فقط.", threadID);

    const cmdRoles = global.config?.commandRoles || {};
    const cmdRole  = cmdRoles[cmdName] ?? (cmd.config.role ?? 0);
    const numRole  = typeof cmdRole === "string"
      ? (cmdRole === "owner" ? 3 : cmdRole === "admin" ? 2 : 0)
      : Number(cmdRole);

    if (numRole >= 3 && !_isOwner)
      return api.sendMessage("❌ هذا الأمر للمالك فقط.", threadID);
    if (numRole >= 2 && !_isAdmin)
      return api.sendMessage("❌ هذا الأمر لأدمن البوت فقط.", threadID);

    // Anti-spam
    if (!_isAdmin) {
      const spam = checkSpam(senderID);
      if (spam.exceeded) {
        if (!spam.warned) { spam.setWarn(); api.sendMessage("⚠️ أنت تستخدم الأوامر بسرعة كبيرة، انتظر قليلاً!", threadID); }
        return;
      }
    }

    console.log(`${chalk.gray(ts())} ${chalk.magenta("›")} /${chalk.bold.magenta(cmdName)} | ${chalk.cyan(senderName)} @ ${chalk.cyan(threadName)}`);
    logCommand(senderID, threadID, cmdName, args).catch(() => {});

    const runFn = cmd.run || cmd.onStart;
    if (typeof runFn !== "function") return;

    try {
      await runFn({
        api, event, args,
        body, threadID, senderID,
        isGroup, isOwner: _isOwner, isAdmin: _isAdmin,
        senderName, threadName,
        prefix, config, commands,
        // Backward compat (old onStart format)
        message: {
          reply: (msg, cb) => api.sendMessage(msg, threadID, cb),
          send:  (msg, tid, cb) => api.sendMessage(msg, tid || threadID, cb),
          react: (emoji, mid, cb) => { try { api.setMessageReaction(emoji, mid || messageID, cb, true); } catch (_) {} },
          unsend:(mid, cb) => { try { api.unsendMessage(mid || messageID, cb); } catch (_) {} },
        },
        role: _isOwner ? 3 : _isAdmin ? 2 : 1,
      });
    } catch (e) {
      console.error(`${chalk.red("✘")} ${cmdName} error: ${e.message}`);
      try { api.sendMessage(`❌ خطأ في الأمر \`${cmdName}\`: ${e.message}`, threadID); } catch (_) {}
    }

  // ══ GROUP EVENT ══════════════════════════════════════════════════════════════
  } else if (event.type === "event") {
    const { threadID, logMessageType, logMessageData } = event;
    const threadName = await resolveThread(api, threadID).catch(() => threadID);
    logEvent(logMessageType || "group_event", threadName);

    // Dispatch handleEvent to commands that need it (e.g. كنيات)
    if (commands) {
      for (const [, cmd] of commands) {
        if (typeof cmd.handleEvent === "function") {
          try { await cmd.handleEvent({ api, event, threadID, logMessageType, logMessageData }); }
          catch (_) {}
        }
        if (typeof cmd.onEvent === "function") {
          try { await cmd.onEvent({ api, event, threadID, logMessageType, logMessageData }); }
          catch (_) {}
        }
      }
    }

    switch (logMessageType) {
      case "log:subscribe": {
        const names = (logMessageData?.addedParticipants || []).map(p => p.fullName || p.userFbId).join(", ");
        if (config.groupEvents?.welcomeMessage && names) {
          const msg = config.groupEvents.welcomeMessage.replace("{name}", names).replace("{thread}", threadName);
          setTimeout(() => api.sendMessage(msg, threadID, () => {}), 1500);
        }
        break;
      }
      case "log:unsubscribe": {
        if (config.groupEvents?.leaveMessage) {
          const leftId = logMessageData?.leftParticipantFbId;
          if (leftId) {
            const leftName = await resolveUser(api, leftId).catch(() => leftId);
            const msg = config.groupEvents.leaveMessage.replace("{name}", leftName).replace("{thread}", threadName);
            setTimeout(() => api.sendMessage(msg, threadID, () => {}), 1500);
          }
        }
        break;
      }
    }

  // ══ TYPING ═══════════════════════════════════════════════════════════════════
  } else if (event.type === "typ") {
    // silent

  // ══ REACTION ═════════════════════════════════════════════════════════════════
  } else if (event.type === "message_reaction") {
    global._lastActivity = Date.now();

  // ══ READ RECEIPT ══════════════════════════════════════════════════════════════
  } else if (event.type === "read_receipt") {
    global._lastActivity = Date.now();
  }
};
