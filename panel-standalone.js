/**
 * Crolo Bot — Main Entry Point (David-bot style)
 * Runs panel + bot together. Panel manages the bot process.
 * Panel stays alive even if bot crashes/restarts.
 */
"use strict";

process.on("unhandledRejection", (e) => console.error("[MAIN]", e?.message || e));
process.on("uncaughtException",  (e) => console.error("[MAIN]", e?.message || e));

const { spawn } = require("child_process");
const fs        = require("fs-extra");
const path      = require("path");

const CONFIG_PATH  = path.join(__dirname, "config.json");
const ACCOUNT_PATH = path.join(__dirname, "account.txt");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch (_) { return {}; }
}

const config = loadConfig();
const PORT   = process.env.PORT || config?.panel?.port || 3000;
config.panel = config.panel || {};
config.panel.port = PORT;

// ── Bot Process Manager ───────────────────────────────────────────────────────
let botProcess    = null;
let botRestarts   = 0;
let botAutoRestart = true;
let botStartTime  = null;
const MAX_BOT_RESTARTS = 20;
const BASE_DELAY_MS    = 3000;
const MAX_DELAY_MS     = 60000;
let   restartDelay     = BASE_DELAY_MS;
let   restartTimer     = null;

function hasCookies() {
  try {
    const raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();
    return raw.length > 10;
  } catch (_) { return false; }
}

function startBot() {
  if (botProcess) {
    console.log("[BOT-MGR] Bot is already running (PID " + botProcess.pid + ")");
    return false;
  }
  if (!hasCookies()) {
    console.log("[BOT-MGR] No cookies found — add cookies via the panel first");
    return false;
  }

  botRestarts++;
  botStartTime = Date.now();
  console.log(`[BOT-MGR] Starting bot... (launch #${botRestarts})`);

  botProcess = spawn(
    process.execPath,
    [path.join(__dirname, "src/index.js")],
    { stdio: "inherit", env: { ...process.env } }
  );

  botProcess.on("exit", (code, signal) => {
    const wasRunning = !!botProcess;
    botProcess   = null;
    botStartTime = null;

    if (!wasRunning) return;

    if (code === 0) {
      console.log("[BOT-MGR] Bot exited cleanly — restarting in 2s...");
      restartDelay = BASE_DELAY_MS;
      if (botAutoRestart) restartTimer = setTimeout(startBot, 2000);
      return;
    }

    if (code === 1 && botRestarts >= MAX_BOT_RESTARTS) {
      console.error("[BOT-MGR] Max restarts reached — stopping auto-restart");
      botAutoRestart = false;
      return;
    }

    console.log(`[BOT-MGR] Bot exited (code=${code}) — restarting in ${Math.round(restartDelay / 1000)}s`);
    if (botAutoRestart) {
      restartTimer = setTimeout(() => {
        restartDelay = Math.min(restartDelay * 1.8, MAX_DELAY_MS);
        startBot();
      }, restartDelay);
    }
  });

  botProcess.on("error", (err) => {
    console.error("[BOT-MGR] Spawn error:", err.message);
    botProcess   = null;
    botStartTime = null;
  });

  return true;
}

function stopBot() {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  botAutoRestart = false;
  if (!botProcess) return false;
  console.log("[BOT-MGR] Stopping bot...");
  botProcess.kill("SIGTERM");
  botProcess   = null;
  botStartTime = null;
  return true;
}

function restartBot() {
  botAutoRestart = true;
  restartDelay   = BASE_DELAY_MS;
  botRestarts    = 0;
  if (botProcess) {
    console.log("[BOT-MGR] Restarting bot...");
    botProcess.kill("SIGTERM");
    botProcess = null;
  }
  setTimeout(startBot, 800);
}

function getBotStatus() {
  return {
    running:   !!botProcess,
    pid:       botProcess?.pid || null,
    restarts:  botRestarts,
    uptime:    botStartTime ? Date.now() - botStartTime : 0,
    autoRestart: botAutoRestart,
  };
}

// Expose bot manager globally so panel server can use it
global.botManager = { startBot, stopBot, restartBot, getBotStatus, hasCookies };

// ── Start Panel ───────────────────────────────────────────────────────────────
const panel = require("./src/panel/server");
panel.start(config);

// ── Auto-start bot if cookies exist ──────────────────────────────────────────
if (hasCookies()) {
  console.log("[BOT-MGR] Cookies found — auto-starting bot in 3s...");
  botAutoRestart = true;
  restartTimer   = setTimeout(startBot, 3000);
} else {
  console.log("[BOT-MGR] No cookies found — open the panel and add cookies, then click Start Bot");
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT",  () => { stopBot(); process.exit(0); });
process.on("SIGTERM", () => { stopBot(); process.exit(0); });
