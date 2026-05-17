/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         CROLO BOT — Main Engine                                ║
 * ║         Facebook Messenger Bot powered by Djamel-FCA           ║
 * ║         Admin-only • SQLite • MQTT • Human Behavior            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
"use strict";

// ─── Polyfills ────────────────────────────────────────────────────────────────
(function polyfill() {
  try {
    if (!global.ReadableStream) {
      const s = require("stream/web");
      Object.assign(global, { ReadableStream: s.ReadableStream, WritableStream: s.WritableStream, TransformStream: s.TransformStream });
    }
  } catch (_) {}
  try { if (!global.Blob) global.Blob = require("buffer").Blob; } catch (_) {}
  try {
    if (!global.TextEncoder) {
      const { TextEncoder, TextDecoder } = require("util");
      Object.assign(global, { TextEncoder, TextDecoder });
    }
  } catch (_) {}
  if (!global.File) {
    global.File = class File extends (global.Blob || Object) {
      constructor(c, n, o = {}) { try { super(c, o); } catch (_) {} this._name = n; this._lm = o.lastModified ?? Date.now(); }
      get name()         { return this._name; }
      get lastModified() { return this._lm; }
    };
  }
})();

process.on("unhandledRejection", (e) => {
  try { (global.log?.error || console.error)("BOT", e?.message || String(e)); } catch (_) {}
});
process.on("uncaughtException", (e) => {
  try { (global.log?.error || console.error)("BOT", e?.message || String(e)); } catch (_) {}
});

const fs       = require("fs-extra");
const path     = require("path");
const chalk    = require("chalk");
const gradient = require("gradient-string");
const moment   = require("moment-timezone");

const DjamelFCA      = require("./Djamel-fca");
const { initGlobals } = require("./src/engine/core");
const { loadCommands } = require("./src/engine/loader");
const handlerEvents   = require("./src/engine/handlerEvents");
const mqttHealth      = require("./src/protection/mqttHealthCheck");
const keepAlive       = require("./src/protection/keepAlive");
const Uprotection     = require("./src/protection/Uprotection");
const { addAdmin, getAdminIDs } = require("./database/db");

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH  = path.join(__dirname, "config.json");
const ACCOUNT_PATH = path.join(__dirname, "account.txt");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch (_) { return {}; }
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function printBanner(config) {
  const g = gradient(["#00b4d8", "#0077b6", "#023e8a"]);
  console.log("\n" + g("╔══════════════════════════════════════════╗"));
  console.log(g("║        CROLO BOT — v1.0.0                ║"));
  console.log(g("║        Facebook Messenger Bot            ║"));
  console.log(g("║        Powered by Djamel-FCA             ║"));
  console.log(g("╚══════════════════════════════════════════╝") + "\n");
  console.log(chalk.cyan(`  Bot Name : ${config.botName || "Crolo Bot"}`));
  console.log(chalk.cyan(`  Prefix   : ${config.prefix || "/"}`));
  console.log(chalk.cyan(`  Panel    : running separately (port ${config.panel?.port || 3000})`));
  console.log(chalk.cyan(`  Started  : ${moment().tz(config.timezone || "UTC").format("YYYY-MM-DD HH:mm:ss z")}`));
  console.log();
}

// ─── Cookie Loader ────────────────────────────────────────────────────────────
function loadCookies() {
  // 1. Try account.txt
  try {
    const raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();
    if (raw) {
      const parsed = DjamelFCA.parseCookies(raw);
      if (parsed) {
        global.log?.info?.("COOKIES", "Loaded cookies from account.txt");
        return parsed;
      }
    }
  } catch (_) {}

  // 2. Try SQLite latest cookie
  try {
    const { getLatestCookie } = require("./database/db");
    const row = getLatestCookie("main");
    if (row?.content) {
      const parsed = DjamelFCA.parseCookies(row.content);
      if (parsed) {
        global.log?.info?.("COOKIES", "Loaded cookies from SQLite database");
        return parsed;
      }
    }
  } catch (_) {}

  return null;
}

// ─── Save AppState ────────────────────────────────────────────────────────────
function saveAppState(appState) {
  try {
    const json = JSON.stringify(appState, null, 2);
    fs.writeFileSync(ACCOUNT_PATH, json, "utf8");
    const { saveCookie } = require("./database/db");
    saveCookie(json, "main");
    global.log?.info?.("COOKIES", "AppState saved to account.txt and SQLite");
  } catch (err) {
    global.log?.error?.("COOKIES", `Failed to save appState: ${err.message}`);
  }
}

// ─── Sync DB admins → config ────────────────────────────────────────────────
function syncAdmins(config) {
  try {
    const dbAdmins = getAdminIDs();
    const cfgAdmins = (config.adminBot || []).map(String);
    const merged = [...new Set([...cfgAdmins, ...dbAdmins])];
    config.adminBot = merged;

    // Make sure owner and superAdmins are in DB
    const allSupers = [...(config.superAdminBot || []), config.ownerID].filter(Boolean);
    for (const id of allSupers) {
      try { addAdmin(String(id), "system", 3); } catch (_) {}
    }
  } catch (_) {}
}

// ─── Main Login + Listen ─────────────────────────────────────────────────────
async function startBot() {
  const config = loadConfig();
  printBanner(config);
  initGlobals(config);
  syncAdmins(config);

  // Load commands
  const commands = loadCommands("src/commands");
  global.CroloBot.commands = commands;

  // Load cookies
  const appState = loadCookies();
  if (!appState) {
    global.log?.error?.("LOGIN", "No cookies found in account.txt or database.");
    global.log?.error?.("LOGIN", "Please add your Facebook cookies to account.txt and restart.");
    process.exit(0);
  }

  // Login
  global.log?.info?.("LOGIN", "Logging in to Facebook...");

  let api;
  try {
    api = await DjamelFCA.login({
      appState,
      userAgent: config.facebookAccount?.userAgent || DjamelFCA.randomUA(),
      onAppStateUpdate: saveAppState,
      maxRetries: 3,
    });
  } catch (err) {
    global.log?.error?.("LOGIN", `Login failed: ${err.message}`);
    process.exit(1);
  }

  global.CroloBot.fcaApi = api;

  // Get bot ID
  try {
    const uid = api.getCurrentUserID();
    global.CroloBot.botID = uid;
    global.log?.success?.("LOGIN", `Logged in as ${uid}`);
  } catch (_) {}

  // Start protection layers
  Uprotection.startAll(api);
  mqttHealth.start();
  keepAlive.start();

  // Keep process alive regardless of MQTT state
  const _keepAliveTimer = setInterval(() => {}, 30000);

  // MQTT reconnect state
  let mqttRetryCount   = 0;
  let mqttRetryTimer   = null;
  let currentApi       = api;
  let mqttRunning      = false;

  function scheduleReconnect(delayMs) {
    if (mqttRetryTimer) return;
    const waitSec = Math.round(delayMs / 1000);
    global.log?.warn?.("MQTT", `Will retry MQTT in ${waitSec}s (attempt ${mqttRetryCount + 1})...`);
    mqttRetryTimer = setTimeout(async () => {
      mqttRetryTimer = null;
      mqttRetryCount++;
      try {
        global.log?.warn?.("MQTT", "Re-logging in for MQTT reconnect...");
        const newApi = await DjamelFCA.login({
          appState:          loadCookies(),
          userAgent:         DjamelFCA.randomUA(),
          onAppStateUpdate:  saveAppState,
          maxRetries:        2,
        });
        currentApi                = newApi;
        global.CroloBot.fcaApi    = newApi;
        global.log?.success?.("MQTT", "Re-login OK — starting MQTT...");
        startListening(newApi);
      } catch (err) {
        global.log?.error?.("MQTT", `Re-login failed: ${err.message}`);
        const nextDelay = Math.min(60000 * mqttRetryCount, 300000);
        scheduleReconnect(nextDelay);
      }
    }, delayMs);
  }

  function startListening(listenApi) {
    if (mqttRunning) return;
    mqttRunning = true;
    global.log?.info?.("BOT", "Listening for messages...");

    listenApi.listenMqtt(async (err, event) => {
      if (err) {
        const msg = err?.error || err?.message || String(err);
        global.log?.error?.("MQTT", msg);
        mqttRunning = false;
        // Retry after backoff — max 5 min
        const delay = Math.min(15000 * Math.pow(1.8, mqttRetryCount), 300000);
        scheduleReconnect(delay);
        return;
      }
      // Successful event — reset retry counter
      mqttRetryCount = 0;
      try {
        await handlerEvents(listenApi, event);
      } catch (e) {
        global.log?.error?.("HANDLER", e.message);
      }
    });
  }

  // Re-login function for MQTT health check
  global.CroloBot.reLoginBot = async () => {
    global.log?.warn?.("RELOGIN", "Attempting re-login...");
    try {
      const newApi = await DjamelFCA.login({
        appState:         loadCookies(),
        userAgent:        DjamelFCA.randomUA(),
        onAppStateUpdate: saveAppState,
        maxRetries:       2,
      });
      currentApi             = newApi;
      global.CroloBot.fcaApi = newApi;
      mqttRunning            = false;
      global.log?.success?.("RELOGIN", "Re-login successful");
      startListening(newApi);
    } catch (err) {
      global.log?.error?.("RELOGIN", `Re-login failed: ${err.message}`);
    }
  };

  global.log?.success?.("BOT", `Crolo Bot is running! Prefix: ${config.prefix || "/"}`);
  global.log?.success?.("BOT", `Admin-only mode: ${config.adminOnly?.enable !== false ? "ON" : "OFF"}`);

  startListening(currentApi);
}

startBot().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
