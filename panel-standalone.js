/**
 * Crolo Bot — Standalone Panel Server
 * Runs independently from the bot so the panel stays up
 * even when the bot is restarting or has no cookies yet.
 */
"use strict";

process.on("unhandledRejection", (e) => console.error("[PANEL]", e?.message || e));
process.on("uncaughtException",  (e) => console.error("[PANEL]", e?.message || e));

const fs   = require("fs-extra");
const path = require("path");

// Load config
const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch (_) { return {}; }
}

const config = loadConfig();

// Use PORT env var (set by Replit workflow) or fall back to config port
const PORT = process.env.PORT || config?.panel?.port || 3000;

// Override config port with the actual port we'll use
config.panel = config.panel || {};
config.panel.port = PORT;

// Start the panel
const panel = require("./src/panel/server");
panel.start(config);

console.log(`[PANEL] Crolo Bot Admin Panel started on port ${PORT}`);
console.log(`[PANEL] Password: configured in config.json`);
