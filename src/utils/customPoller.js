"use strict";
/**
 * customPoller.js — mbasic.facebook.com HTML poller
 * Reads messages by scraping mbasic.facebook.com (no Messenger API / m_sess needed)
 * Works with basic facebook.com cookies (c_user + xs)
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const chalk   = require("chalk");
const moment  = require("moment-timezone");

const ts  = () => moment().tz(global.config?.timezone || "Africa/Algiers").format("HH:mm:ss");
const log = {
  info:  (m) => console.log(`${chalk.gray(ts())} ${chalk.cyan("•")} [POLLER] ${m}`),
  ok:    (m) => console.log(`${chalk.gray(ts())} ${chalk.green("✔")} [POLLER] ${chalk.green(m)}`),
  warn:  (m) => console.log(`${chalk.gray(ts())} ${chalk.yellow("⚠")} [POLLER] ${chalk.yellow(m)}`),
  error: (m) => console.log(`${chalk.gray(ts())} ${chalk.red("✘")} [POLLER] ${chalk.red(m)}`),
};

// ─── State ────────────────────────────────────────────────────────────────────
let _timer        = null;
let _running      = false;
let _startTs      = 0;
let _pollInterval = 6000;
let _failCount    = 0;
let _seenMsgIDs   = new Set();
let _lastSeen     = new Map();   // threadID → last message timestamp
let _cookieStr    = "";
let _uid          = "";

const MAX_FAILS = 20;
const UA = "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

// ─── Cookie helper ────────────────────────────────────────────────────────────
function buildCookieStr(api) {
  try {
    const state = api.getAppState ? api.getAppState() : [];
    if (Array.isArray(state) && state.length > 0) {
      return state.map(c => `${c.key}=${c.value}`).join("; ");
    }
  } catch (_) {}
  return _cookieStr;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function fetchMbasic(path, cookieStr) {
  const url = `https://mbasic.facebook.com${path}`;
  const res = await axios.get(url, {
    headers: {
      "cookie":          cookieStr,
      "user-agent":      UA,
      "accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ar,en;q=0.8",
      "accept-encoding": "gzip, deflate",
    },
    timeout:         15000,
    maxRedirects:    3,
    validateStatus:  s => s < 500,
  });
  return res.data || "";
}

// ─── Parse inbox — returns [{threadID, href, name, hasNew}] ───────────────────
function parseInbox(html) {
  const $ = cheerio.load(html);
  const threads = [];

  // Each conversation row in mbasic inbox
  $("a[href*='/messages/thread/']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/messages\/thread\/([^/?#]+)/);
    if (!m) return;
    const threadID = m[1];
    const name     = $(el).text().trim();
    threads.push({ threadID, href, name });
  });

  // Deduplicate
  const seen = new Set();
  return threads.filter(t => {
    if (seen.has(t.threadID)) return false;
    seen.add(t.threadID);
    return true;
  });
}

// ─── Parse thread page — returns [{msgID, senderID, senderName, body, ts, isGroup}] ──
function parseThread(html, botUID) {
  const $ = cheerio.load(html);
  const msgs = [];

  // mbasic message rows — each has data-ft attribute with JSON
  $("[data-ft]").each((_, el) => {
    try {
      const ftRaw = $(el).attr("data-ft") || "{}";
      const ft    = JSON.parse(ftRaw);

      const senderID = String(ft.content_owner_id_new || ft.sender_id || "");
      if (!senderID || senderID === botUID) return;

      const msgID = String(ft.mf_story_key || ft.msg_id || "");
      const msgTs = parseInt(ft.publish_time || ft.creation_time || ft.timestamp || 0) * 1000;

      // Extract body text — look inside for text nodes
      const body = $(el).find("[data-sigil='message-text']").text().trim()
                || $(el).find(".message-text").text().trim()
                || $(el).text().trim();

      if (!body && !msgID) return;

      msgs.push({
        msgID:      msgID || `mbasic_${senderID}_${msgTs}`,
        senderID,
        senderName: String(ft.actorName || ""),
        body,
        ts:         msgTs || Date.now(),
      });
    } catch (_) {}
  });

  // Fallback: look for <div role="article"> or .msg elements
  if (msgs.length === 0) {
    $("div[id^='mid']").each((_, el) => {
      const id     = $(el).attr("id") || "";
      const body   = $(el).text().trim();
      if (!body) return;
      msgs.push({
        msgID:     id,
        senderID:  "unknown",
        senderName: "",
        body,
        ts:        Date.now(),
      });
    });
  }

  return msgs;
}

// ─── Determine if thread is group ────────────────────────────────────────────
function threadIsGroup(threadID) {
  // Group thread IDs are typically 17+ digits
  return /^\d{15,}$/.test(threadID) || threadID.includes("@");
}

// ─── Build event object ───────────────────────────────────────────────────────
function buildEvent(msg, threadID) {
  return {
    type:        "message",
    senderID:    msg.senderID,
    body:        msg.body,
    threadID:    threadID,
    messageID:   msg.msgID,
    timestamp:   msg.ts,
    attachments: [],
    isGroup:     threadIsGroup(threadID),
    mentions:    {},
    _mbasic:     true,
  };
}

// ─── One poll cycle ───────────────────────────────────────────────────────────
async function pollOnce(api, eventHandler) {
  _cookieStr = buildCookieStr(api);
  if (!_cookieStr.includes("c_user")) {
    log.warn("لا تتوفر كوكيز c_user — تخطي الدورة");
    return;
  }

  let html;
  try {
    html = await fetchMbasic("/messages/", _cookieStr);
  } catch (e) {
    _failCount++;
    if (_failCount % 5 === 1) log.warn(`فشل جلب صندوق الوارد (${_failCount}): ${e.message}`);
    if (_failCount >= MAX_FAILS) {
      log.error("فشل متكرر — إيقاف مؤقت لمدة دقيقتين");
      stopPoller();
      setTimeout(() => {
        if (!_running) { _running = true; _failCount = 0; scheduleNext(api, eventHandler); }
      }, 120000);
    }
    return;
  }

  // Check if redirected to login
  if (html.includes("login_form") || html.includes("identifierconfirm") || html.includes("/login/")) {
    log.warn("الكوكيز انتهت صلاحيتها أو انتهت جلسة — يحتاج تحديث الكوكيز");
    _failCount++;
    return;
  }

  if (_failCount > 0) {
    log.ok("Custom Poller استُعيدَ ✔");
    _failCount = 0;
  }

  const threads = parseInbox(html);
  if (threads.length === 0) {
    // Might be a different HTML structure — log a snippet for debugging
    if (_pollInterval > 6000) log.info("صندوق الوارد: لا محادثات أو هيكل HTML مختلف");
    return;
  }

  for (const thread of threads.slice(0, 15)) {
    const tid = thread.threadID;

    let threadHtml;
    try {
      threadHtml = await fetchMbasic(thread.href, _cookieStr);
    } catch (e) {
      continue;
    }

    const messages = parseThread(threadHtml, _uid);
    const lastTs   = _lastSeen.get(tid) || _startTs;
    let   maxTs    = lastTs;

    for (const msg of messages) {
      if (msg.ts < _startTs)        continue;
      if (msg.ts <= lastTs)         continue;
      if (_seenMsgIDs.has(msg.msgID)) continue;
      if (msg.senderID === _uid)    continue;

      _seenMsgIDs.add(msg.msgID);
      if (msg.ts > maxTs) maxTs = msg.ts;

      const event = buildEvent(msg, tid);
      log.info(`رسالة جديدة من ${msg.senderID} في ${tid}: "${msg.body.slice(0, 50)}"`);
      try {
        await eventHandler(api, event);
      } catch (e) {
        log.error(`handler خطأ: ${e.message}`);
      }
    }

    if (maxTs > lastTs) _lastSeen.set(tid, maxTs);
    await new Promise(r => setTimeout(r, 300));
  }

  // Cleanup old seenMsgIDs
  if (_seenMsgIDs.size > 5000) {
    const arr = [..._seenMsgIDs];
    _seenMsgIDs = new Set(arr.slice(-2500));
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
function scheduleNext(api, eventHandler) {
  if (!_running) return;
  _timer = setTimeout(async () => {
    if (!_running) return;
    try { await pollOnce(api, eventHandler); }
    catch (e) { log.error(`loop خطأ: ${e.message}`); }
    scheduleNext(api, eventHandler);
  }, _pollInterval);
}

// ─── Public API ───────────────────────────────────────────────────────────────
function startPoller(api, eventHandler, intervalMs = 7000) {
  stopPoller();

  _running      = true;
  _pollInterval = Math.max(5000, intervalMs);
  _startTs      = Date.now();
  _failCount    = 0;
  _seenMsgIDs.clear();
  _lastSeen.clear();
  _uid          = api.getCurrentUserID ? String(api.getCurrentUserID()) : "";
  _cookieStr    = buildCookieStr(api);

  log.ok(`Custom Poller (mbasic) نشط ✔ — يفحص كل ${_pollInterval / 1000}s | UID: ${_uid}`);

  // First poll after 3s
  _timer = setTimeout(async () => {
    if (!_running) return;
    try { await pollOnce(api, eventHandler); }
    catch (_) {}
    scheduleNext(api, eventHandler);
  }, 3000);
}

function stopPoller() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _running = false;
}

module.exports = { startPoller, stopPoller };
