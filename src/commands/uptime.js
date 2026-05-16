/**
 * Crolo Bot — /uptime command
 * Shows bot uptime, memory usage, and stats
 */
"use strict";

const os = require("os");

function fmt(ms) {
  const s   = Math.floor(ms / 1000);
  const d   = Math.floor(s / 86400);
  const h   = Math.floor((s % 86400) / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d)   parts.push(`${d}d`);
  if (h)   parts.push(`${h}h`);
  if (m)   parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + " MB"; }

module.exports = {
  config: {
    name:        "uptime",
    aliases:     ["up", "ping", "status"],
    version:     "1.0",
    author:      "Crolo",
    countDown:   5,
    role:        2,
    category:    "info",
    description: "Show bot uptime and system stats",
    guide:       { en: "{pn} — Show bot uptime and stats" },
  },

  onStart: async function ({ api, event, message }) {
    const start = global.CroloBot?.startTime || Date.now();
    const upMs  = Date.now() - start;
    const mem   = process.memoryUsage();
    const sysM  = { total: os.totalmem(), free: os.freemem() };
    const cmds  = global.CroloBot?.commands?.size || 0;
    const uid   = global.CroloBot?.botID || "—";
    const prefix = global.CroloBot?.config?.prefix || "/";

    const { getAllAdmins } = require("../../database/db");
    const admins = getAllAdmins();

    const text = [
      "╔══════════════════════════╗",
      "║   🤖 CROLO BOT — STATUS  ║",
      "╚══════════════════════════╝",
      "",
      `⏱  Uptime     : ${fmt(upMs)}`,
      `🆔 Bot ID     : ${uid}`,
      `📦 Commands   : ${cmds}`,
      `👑 Admins     : ${admins.length}`,
      "",
      "── Memory ────────────────",
      `  RSS       : ${mb(mem.rss)}`,
      `  Heap Used : ${mb(mem.heapUsed)}`,
      `  Heap Total: ${mb(mem.heapTotal)}`,
      "",
      "── System ────────────────",
      `  RAM       : ${mb(sysM.total - sysM.free)} / ${mb(sysM.total)}`,
      `  Node.js   : ${process.version}`,
      `  Platform  : ${process.platform}`,
      "",
      `Prefix: ${prefix}`,
    ].join("\n");

    await message.reply(text);
  },
};
