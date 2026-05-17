/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║       DJAMEL-FCA v3.1 — Facebook Client Abstractions               ║
 * ║       Built for Crolo Bot — Based on DAVID V1 by DJAMEL            ║
 * ║       Updated for 2026 compatibility                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Features:
 *  ✦ Cookie parsing: c3c, JSON Array (key/name), Netscape, Header String
 *  ✦ Live session validation via mbasic.facebook.com
 *  ✦ Human behavior simulation (typing delay, presence simulation)
 *  ✦ User-Agent rotation (8 real mobile agents)
 *  ✦ Cookie deduplication & compression
 *  ✦ sendMessageHuman() — human-like delay before sending
 *  ✦ buildReplyHelper() — GoatBot-compatible message helper
 *  ✦ Exponential backoff login retry
 *  ✦ Auto AppState save after login
 *  ✦ Thread info cache
 *  ✦ Anti-detection headers
 */
"use strict";

const loginFCA = require("@dongdev/fca-unofficial");
const axios    = require("axios");
const fs       = require("fs-extra");
const path     = require("path");

// ─── User-Agent Pool ─────────────────────────────────────────────────────────
const UA_POOL = [
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; OnePlus 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
];

function randomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

// ─── Cookie Normalizer ────────────────────────────────────────────────────────
// Ensures every cookie has both `key` (FCA format) and `name` (standard format)
function normalizeCookie(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  // If cookie uses `key` field (FCA/browser-extension format), ensure `name` is also set
  if (out.key && !out.name) out.name = out.key;
  // If cookie uses `name` field (standard format), ensure `key` is also set
  if (out.name && !out.key) out.key = out.name;
  return out;
}

function normalizeCookies(cookies) {
  if (!Array.isArray(cookies)) return cookies;
  return cookies.map(normalizeCookie);
}

// ─── Cookie Parsers ───────────────────────────────────────────────────────────
function parseCookies(raw) {
  if (!raw || typeof raw !== "string") return null;
  raw = raw.trim();

  if (!raw) return null;

  // Try JSON (c3c / Array format — supports both {key:...} and {name:...})
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeCookies(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.cookies))
      return normalizeCookies(parsed.cookies);
    if (parsed && typeof parsed === "object") return normalizeCookies([parsed]);
  } catch (_) {}

  // Netscape format (contains "# Netscape HTTP Cookie File" or tab-separated)
  if (raw.includes("# Netscape") || (raw.includes("\t") && raw.split("\n").some(l => l.split("\t").length >= 7))) {
    const cookies = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const parts = t.split("\t");
      if (parts.length >= 7) {
        const name = parts[5];
        cookies.push({
          key:    name,
          name:   name,
          domain: parts[0].replace(/^\./, ""),
          path:   parts[2],
          secure: parts[3] === "TRUE",
          expiry: parseInt(parts[4]) || 0,
          value:  parts[6],
        });
      }
    }
    if (cookies.length) return cookies;
  }

  // Header string format: "name=value; name2=value2"
  if (raw.includes("=")) {
    const cookies = raw.split(";").map((p) => {
      const [n, ...rest] = p.trim().split("=");
      const name = n.trim();
      const value = rest.join("=").trim();
      return { key: name, name, value };
    }).filter((c) => c.name && c.value !== undefined);
    if (cookies.length) return cookies;
  }

  return null;
}

function deduplicateCookies(cookies) {
  if (!Array.isArray(cookies)) return cookies;
  const seen = new Map();
  for (const c of cookies) {
    const cookieName = c.key || c.name || "";
    const cookieDomain = c.domain || "";
    const mapKey = `${cookieName}||${cookieDomain}`;
    seen.set(mapKey, c);
  }
  return [...seen.values()];
}

// ─── Session Validation ───────────────────────────────────────────────────────
async function validateSession(appState) {
  try {
    const cookieStr = Array.isArray(appState)
      ? appState.map((c) => `${c.key || c.name}=${c.value}`).join("; ")
      : "";

    const res = await axios.get("https://mbasic.facebook.com/", {
      headers: {
        Cookie:          cookieStr,
        "User-Agent":    randomUA(),
        "Accept":        "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
      },
      timeout:          10000,
      maxRedirects:     3,
      validateStatus:   () => true,
    });

    const html = res.data || "";
    const isLoggedIn = html.includes("profile_id") || html.includes("c_user") || html.includes("logout");
    return isLoggedIn;
  } catch (_) {
    return false;
  }
}

// ─── Human Typing Delay Calculator ───────────────────────────────────────────
function calcTypingDelay(text = "") {
  const len = typeof text === "string" ? text.length : 0;
  const wpm = 200 + Math.floor(Math.random() * 100);
  const chars_per_sec = (wpm * 5) / 60;
  let delay = (len / chars_per_sec) * 1000;
  delay = Math.max(800, Math.min(delay, 6000));
  delay += Math.floor(Math.random() * 400) - 200;
  return Math.round(delay);
}

// ─── Simulate Typing Indicator ────────────────────────────────────────────────
async function simulateTyping(api, threadID, delayMs = 1500) {
  try {
    if (typeof api?.sendTypingIndicator === "function") {
      const stop = api.sendTypingIndicator(threadID);
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 7000)));
      if (typeof stop === "function") stop();
    } else {
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 7000)));
    }
  } catch (_) {}
}

// ─── Human Read Receipt ───────────────────────────────────────────────────────
async function simulateReadReceipt(api, threadID) {
  try {
    const delay = 300 + Math.floor(Math.random() * 800);
    await new Promise((r) => setTimeout(r, delay));
    if (typeof api?.markAsRead === "function") {
      await new Promise((res) => api.markAsRead(threadID, res));
    }
  } catch (_) {}
}

// ─── Thread Info Cache ────────────────────────────────────────────────────────
const _threadCache = new Map();
const THREAD_CACHE_TTL = 15 * 60 * 1000;

async function getThreadInfo(api, threadID) {
  const cached = _threadCache.get(threadID);
  if (cached && Date.now() - cached.ts < THREAD_CACHE_TTL) return cached.data;
  return new Promise((res, rej) => {
    api.getThreadInfo(threadID, (err, data) => {
      if (err) return rej(err);
      _threadCache.set(threadID, { data, ts: Date.now() });
      res(data);
    });
  });
}

// ─── Build Reply Helper ────────────────────────────────────────────────────────
function buildReplyHelper(api, event) {
  return {
    reply: async (msg, cb) => {
      try {
        const text  = typeof msg === "string" ? msg : msg?.body || "";
        const delay = calcTypingDelay(text);
        await simulateTyping(api, event.threadID, delay);
      } catch (_) {}
      return new Promise((resolve, reject) => {
        api.sendMessage(msg, event.threadID, (err, info) => {
          if (cb) cb(err, info);
          if (err) return reject(err);
          resolve(info);
        });
      });
    },
    unsend: (mid, cb) => {
      try { api.unsendMessage(mid || event.messageID, cb); } catch (_) {}
    },
    react: (emoji, mid, cb) => {
      try { api.setMessageReaction(emoji, mid || event.messageID, cb, true); } catch (_) {}
    },
    send: (msg, tid, cb) => {
      return new Promise((resolve, reject) => {
        const target = tid || event.threadID;
        api.sendMessage(msg, target, (err, info) => {
          if (cb) cb(err, info);
          if (err) return reject(err);
          resolve(info);
        });
      });
    },
  };
}

// ─── Human-like sendMessage ────────────────────────────────────────────────────
async function sendMessageHuman(api, msg, threadID) {
  const text  = typeof msg === "string" ? msg : msg?.body || "";
  const delay = calcTypingDelay(text);
  await simulateTyping(api, threadID, delay);
  return new Promise((res, rej) => {
    api.sendMessage(msg, threadID, (err, info) => {
      if (err) rej(err); else res(info);
    });
  });
}

// ─── Main Login Function ─────────────────────────────────────────────────────
async function login(options = {}) {
  const {
    appState,
    email,
    password,
    userAgent,
    onAppStateUpdate,
    maxRetries = 3,
  } = options;

  const loginOpts = {
    logLevel:         "silent",
    userAgent:        userAgent || randomUA(),
    listenEvents:     true,
    updatePresence:   false,
    autoMarkDelivery: false,
    autoMarkRead:     false,
    forceLogin:       false,
    selfListen:       false,
    online:           true,
    autoReconnect:    true,
  };

  // Normalize and deduplicate cookies before login
  const normalizedState = appState ? normalizeCookies(appState) : null;

  const credentials = normalizedState
    ? { appState: deduplicateCookies(normalizedState) }
    : { email, password };

  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const api = await new Promise((res, rej) => {
        loginFCA(credentials, loginOpts, (err, api) => {
          if (err) return rej(err);
          res(api);
        });
      });

      if (onAppStateUpdate) {
        try { onAppStateUpdate(api.getAppState()); } catch (_) {}
      }

      return api;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.error(`[DJAMEL-FCA] Login attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr || new Error("Login failed after all retries");
}

module.exports = {
  login,
  parseCookies,
  normalizeCookies,
  normalizeCookie,
  deduplicateCookies,
  validateSession,
  calcTypingDelay,
  simulateTyping,
  simulateReadReceipt,
  buildReplyHelper,
  sendMessageHuman,
  getThreadInfo,
  randomUA,
};
