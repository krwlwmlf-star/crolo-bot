"use strict";

const chalk  = require("chalk");
const moment = require("moment-timezone");
const { getOrCreateUser, getOrCreateThread, logCommand } = require("../utils/database");
const threadsData = require("../utils/threadsData");

if (!global._onReply) global._onReply = new Map();

const _spamMap   = new Map();
const _warned    = new Set();
const SPAM_LIMIT = 8;
const SPAM_WIN   = 10000;

function checkSpam(senderID) {
  const now = Date.now();
  let e = _spamMap.get(senderID);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + SPAM_WIN }; _warned.delete(senderID); }
  e.count++;
  _spamMap.set(senderID, e);
  return { exceeded: e.count > SPAM_LIMIT, warned: _warned.has(senderID), setWarn: () => _warned.add(senderID) };
}

const _nc = { u: {}, t: {} };
global._nameCache = _nc;

async function resolveUser(api, uid) {
  if (_nc.u[uid]) return _nc.u[uid];
  try {
    const info = await new Promise((res, rej) => api.getUserInfo(uid, (e, d) => e ? rej(e) : res(d || {})));
    _nc.u[uid] = info[uid]?.name || String(uid);
  } catch { _nc.u[uid] = String(uid); }
  return _nc.u[uid];
}

async function resolveThread(api, tid) {
  if (_nc.t[tid]) return _nc.t[tid];
  try {
    const info = await new Promise((res, rej) => api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d || {})));
    _nc.t[tid] = info?.threadName || String(tid);
  } catch { _nc.t[tid] = String(tid); }
  return _nc.t[tid];
}

const ts = () => moment().tz(global.config?.timezone || "Africa/Algiers").format("HH:mm:ss");

function logMsg(senderName, threadName, body, isGroup, isCmd) {
  const icon  = isGroup ? chalk.blue("👥") : chalk.green("💬");
  const who   = chalk.bold.cyan(senderName);
  const where = isGroup ? chalk.bold.blue(`[${threadName}]`) : chalk.bold.green("DM");
  const pfx   = isCmd ? chalk.magenta("⚡CMD ") : "";
  console.log(`${chalk.gray(ts())} ${icon} ${where} ${chalk.gray("←")} ${who}: ${pfx}${chalk.white(String(body||"").slice(0,120))}`);
}

function logEvent(type, threadName) {
  console.log(`${chalk.gray(ts())} ${chalk.yellow("⚡")} ${chalk.yellow(type)} @ ${chalk.cyan(threadName)}`);
}

module.exports = async function handlerEvents(api, event, commands) {
  if (!event) return;
  commands = commands || global.commands;
  const prefix = global.commandPrefix || "/";
  const config = global.config || {};

  global._lastActivity     = Date.now();
  global._lastMqttActivity = Date.now();
  try { require("../protection/mqttHealthCheck").onMqttActivity(); } catch {}

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

    // ── onReply dispatch ─────────────────────────────────────────────────────
    const repMID = event.messageReply?.messageID;
    if (repMID && global._onReply.has(repMID)) {
      const replyData = global._onReply.get(repMID);
      // Only allow original author or admin to trigger onReply
      if (String(senderID) === String(replyData.author) || _isAdmin) {
        global._onReply.delete(repMID);
        const replyCmd = commands.get(replyData.commandName);
        const replyFn  = replyCmd?.onReply;
        if (typeof replyFn === "function") {
          const msgObj = buildMessage(api, threadID, messageID);
          try {
            await replyFn({
              api, event, args: body.trim().split(/\s+/),
              Reply: replyData, body, threadID, senderID,
              isGroup, isOwner: _isOwner, isAdmin: _isAdmin,
              senderName, threadName, prefix, config, commands,
              threadsData, message: msgObj,
              role: _isOwner ? 3 : _isAdmin ? 2 : 1,
            });
          } catch (e) { console.error(`onReply(${replyData.commandName}):`, e.message); }
        }
        return;
      }
    }

    if (!isCmd) return;

    const _locked = global._lockedThreads || new Set();
    if ((global._globalLock || _locked.has(threadID)) && !_isAdmin) return;

    const args    = body.slice(prefix.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();
    const cmd     = commands.get(cmdName);
    if (!cmd) return;

    if (cmd.config.ownerOnly && !_isOwner)
      return api.sendMessage("❌ هذا الأمر للمالك فقط.", threadID);

    const cmdRoles = global.config?.commandRoles || {};
    const cmdRole  = cmdRoles[cmdName] ?? (cmd.config.role ?? 0);
    const numRole  = typeof cmdRole === "string"
      ? (cmdRole === "owner" ? 3 : cmdRole === "admin" ? 2 : 0)
      : Number(cmdRole);

    if (numRole >= 3 && !_isOwner) return api.sendMessage("❌ هذا الأمر للمالك فقط.", threadID);
    if (numRole >= 2 && !_isAdmin) return;  // صامت — لا رد للعامة

    if (!_isAdmin) {
      const spam = checkSpam(senderID);
      if (spam.exceeded) {
        if (!spam.warned) { spam.setWarn(); api.sendMessage("⚠️ تستخدم الأوامر بسرعة كبيرة!", threadID); }
        return;
      }
    }

    console.log(`${chalk.gray(ts())} ${chalk.magenta("›")} /${chalk.bold.magenta(cmdName)} | ${chalk.cyan(senderName)} @ ${chalk.cyan(threadName)}`);
    logCommand(senderID, threadID, cmdName, args).catch(() => {});

    const runFn = cmd.run || cmd.onStart;
    if (typeof runFn !== "function") return;

    const msgObj = buildMessage(api, threadID, messageID, commands, cmd.config.name);

    try {
      await runFn({
        api, event, args,
        body, threadID, senderID,
        isGroup, isOwner: _isOwner, isAdmin: _isAdmin,
        senderName, threadName,
        prefix, config, commands,
        threadsData,
        commandName: cmd.config.name,
        message: msgObj,
        role: _isOwner ? 3 : _isAdmin ? 2 : 1,
      });
    } catch (e) {
      console.error(`${chalk.red("✘")} ${cmdName}: ${e.message}`);
      try { api.sendMessage(`❌ خطأ: ${e.message}`, threadID); } catch {}
    }

  // ══ GROUP EVENT ══════════════════════════════════════════════════════════════
  } else if (event.type === "event") {
    const { threadID, logMessageType, logMessageData } = event;
    const threadName = await resolveThread(api, threadID).catch(() => threadID);
    logEvent(logMessageType || "group_event", threadName);

    if (commands) {
      for (const [, cmd] of commands) {
        for (const fn of [cmd.handleEvent, cmd.onEvent]) {
          if (typeof fn === "function") {
            try { await fn({ api, event, threadID, logMessageType, logMessageData, threadsData }); }
            catch {}
          }
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

  } else if (event.type === "message_reaction") {
    global._lastActivity = Date.now();
  } else if (event.type === "read_receipt") {
    global._lastActivity = Date.now();
  }
};

function buildMessage(api, threadID, messageID, commands, cmdName) {
  return {
    reply: (msg, cb) => {
      if (typeof msg === "object" && msg !== null && !Buffer.isBuffer(msg)) {
        return api.sendMessage(msg, threadID, (err, info) => {
          if (cb) cb(err, info);
          if (!err && info && cmdName && commands) {
            if (msg._onReplyFn) {
              global._onReply.set(info.messageID, { commandName: cmdName, messageID: info.messageID, author: msg._author || null, ...(msg._replyData || {}) });
            }
          }
        });
      }
      return api.sendMessage(msg, threadID, cb);
    },
    send:  (msg, tid, cb) => api.sendMessage(msg, tid || threadID, cb),
    react: (emoji, mid, cb) => { try { api.setMessageReaction(emoji, mid || messageID, cb, true); } catch {} },
    unsend:(mid, cb) => { try { api.unsendMessage(mid || messageID, cb); } catch {} },
    // Helper to register reply handler
    addReply: (info, data) => {
      if (info?.messageID && cmdName) {
        global._onReply.set(info.messageID, { commandName: cmdName, messageID: info.messageID, ...data });
      }
    },
  };
}
