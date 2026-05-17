/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         CROLO BOT — Watchdog Process                           ║
 * ║         Auto-restarts bot on crash with exponential backoff    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
"use strict";

const { spawn } = require("child_process");
const path      = require("path");

const MAX_RESTARTS    = 25;
const BASE_DELAY_MS   = 3000;
const MAX_DELAY_MS    = 5 * 60 * 1000;
const BACKOFF_MULT    = 1.8;
const RESET_STABLE_MS = 10 * 60 * 1000;

let restarts     = 0;
let currentDelay = BASE_DELAY_MS;
let child        = null;
let stableTimer  = null;

const ts  = () => new Date().toTimeString().slice(0, 8);
const log = (msg) => console.log(`${ts()} [WATCHDOG] ${msg}`);

function start() {
  if (restarts >= MAX_RESTARTS) {
    log(`Max restarts reached (${MAX_RESTARTS}). Stopping.`);
    process.exit(1);
  }

  restarts++;
  log(`Starting Crolo Bot... (attempt ${restarts})`);

  // Pass --experimental-sqlite so node:sqlite works in child process
  child = spawn(
    process.execPath,
    [path.join(__dirname, "src/index.js")],
    {
      stdio: "inherit",
      env:   { ...process.env },
    }
  );

  if (stableTimer) clearTimeout(stableTimer);
  stableTimer = setTimeout(() => {
    restarts     = 0;
    currentDelay = BASE_DELAY_MS;
    log("Bot is stable — restart counter reset");
  }, RESET_STABLE_MS);

  child.on("exit", (code, signal) => {
    if (stableTimer) clearTimeout(stableTimer);
    if (code === 0) {
      log("Clean exit — restarting immediately...");
      restarts = 0; currentDelay = BASE_DELAY_MS;
      setTimeout(start, 1000);
      return;
    }
    log(`Exited with code ${code}/${signal} — restarting in ${Math.round(currentDelay / 1000)}s`);
    setTimeout(() => {
      currentDelay = Math.min(currentDelay * BACKOFF_MULT, MAX_DELAY_MS);
      start();
    }, currentDelay);
  });

  child.on("error", (err) => {
    log(`Spawn error: ${err.message}`);
    setTimeout(start, currentDelay);
  });
}

process.on("SIGINT",  () => { if (child) child.kill("SIGINT");  process.exit(0); });
process.on("SIGTERM", () => { if (child) child.kill("SIGTERM"); process.exit(0); });

start();
