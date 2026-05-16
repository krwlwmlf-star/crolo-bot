/**
 * Crolo Bot — Admin Panel Server
 * Runs on port 8080 (separate from the bot)
 * Features: Auth, Admin management, Cookie update, Live logs, Stats
 */
"use strict";

const express    = require("express");
const http       = require("http");
const socketio   = require("socket.io");
const path       = require("path");
const fs         = require("fs-extra");
const bodyParser = require("body-parser");
const crypto     = require("crypto");

const ROOT         = path.join(__dirname, "../../");
const ACCOUNT_PATH = path.join(ROOT, "account.txt");
const CONFIG_PATH  = path.join(ROOT, "config.json");

let _io     = null;
let _server = null;
let _logBuf = [];
const MAX_LOG = 500;

// ── Token store ───────────────────────────────────────────────────────────────
const _tokens = new Map();

function genToken() {
  const tok = crypto.randomBytes(24).toString("hex");
  _tokens.set(tok, Date.now() + 4 * 60 * 60 * 1000); // 4h expiry
  return tok;
}

function isValidToken(tok) {
  if (!tok) return false;
  const exp = _tokens.get(tok);
  if (!exp) return false;
  if (Date.now() > exp) { _tokens.delete(tok); return false; }
  return true;
}

function authMiddleware(req, res, next) {
  const tok = req.headers["x-crolo-token"] || req.query.token;
  if (isValidToken(tok)) return next();
  res.status(401).json({ ok: false, error: "Unauthorized" });
}

// ── Log interceptor ───────────────────────────────────────────────────────────
function interceptLogs() {
  const origLog   = console.log.bind(console);
  const origError = console.error.bind(console);

  function capture(level, args) {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    // Strip ANSI color codes for storage
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    const entry = { ts: Date.now(), level, msg: clean };
    _logBuf.push(entry);
    if (_logBuf.length > MAX_LOG) _logBuf.shift();
    if (_io) _io.emit("log", entry);
  }

  console.log = (...args) => { origLog(...args); capture("info", args); };
  console.error = (...args) => { origError(...args); capture("error", args); };
}

// ── Start panel ───────────────────────────────────────────────────────────────
function start(config = {}) {
  const port     = config?.panel?.port || 8080;
  const password = config?.panel?.password || "crolo2026";

  interceptLogs();

  const app    = express();
  const server = http.createServer(app);
  const io     = socketio(server, { cors: { origin: "*" } });
  _io     = io;
  _server = server;

  app.use(bodyParser.json({ limit: "2mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/login", (req, res) => {
    const { password: pw } = req.body || {};
    // Re-read config in case it changed
    let cfg = config;
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch (_) {}
    const correct = cfg?.panel?.password || password;
    if (pw !== correct) {
      return res.status(401).json({ ok: false, error: "Wrong password" });
    }
    const token = genToken();
    res.json({ ok: true, token });
  });

  app.post("/api/logout", authMiddleware, (req, res) => {
    const tok = req.headers["x-crolo-token"] || req.query.token;
    _tokens.delete(tok);
    res.json({ ok: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", authMiddleware, (req, res) => {
    const { getAllAdmins } = require("../../database/db");
    const start = global.CroloBot?.startTime || Date.now();
    const upMs  = Date.now() - start;
    const mem   = process.memoryUsage();
    res.json({
      ok: true,
      uptime:     upMs,
      uptimeStr:  fmtUptime(upMs),
      botID:      global.CroloBot?.botID || null,
      commands:   global.CroloBot?.commands?.size || 0,
      adminCount: getAllAdmins().length,
      memory: {
        rss:       Math.round(mem.rss / 1024 / 1024),
        heapUsed:  Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      nodeVersion: process.version,
      platform:    process.platform,
      botName:     global.CroloBot?.config?.botName || "Crolo Bot",
      prefix:      global.CroloBot?.config?.prefix || "/",
      adminOnly:   global.CroloBot?.config?.adminOnly?.enable !== false,
    });
  });

  // ── Admins ────────────────────────────────────────────────────────────────
  app.get("/api/admins", authMiddleware, (req, res) => {
    const { getAllAdmins } = require("../../database/db");
    res.json({ ok: true, admins: getAllAdmins() });
  });

  app.post("/api/admins/add", authMiddleware, (req, res) => {
    const { userID, role } = req.body || {};
    if (!userID || !/^\d+$/.test(String(userID))) {
      return res.status(400).json({ ok: false, error: "Invalid userID" });
    }
    try {
      const { addAdmin, isAdmin } = require("../../database/db");
      if (isAdmin(String(userID))) {
        return res.status(400).json({ ok: false, error: "Already an admin" });
      }
      addAdmin(String(userID), "panel", role || 2);

      // Update in-memory config
      if (global.CroloBot?.config) {
        if (!Array.isArray(global.CroloBot.config.adminBot)) global.CroloBot.config.adminBot = [];
        if (!global.CroloBot.config.adminBot.map(String).includes(String(userID))) {
          global.CroloBot.config.adminBot.push(String(userID));
        }
      }

      res.json({ ok: true, message: `User ${userID} added as admin` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/admins/remove", authMiddleware, (req, res) => {
    const { userID } = req.body || {};
    if (!userID) return res.status(400).json({ ok: false, error: "Missing userID" });

    const ownerID = String(global.CroloBot?.config?.ownerID || "");
    if (String(userID) === ownerID) {
      return res.status(400).json({ ok: false, error: "Cannot remove owner" });
    }

    try {
      const { removeAdmin } = require("../../database/db");
      removeAdmin(String(userID));

      if (global.CroloBot?.config?.adminBot) {
        global.CroloBot.config.adminBot = global.CroloBot.config.adminBot.filter(
          (id) => String(id) !== String(userID)
        );
      }

      res.json({ ok: true, message: `User ${userID} removed from admins` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  app.get("/api/cookies", authMiddleware, (req, res) => {
    try {
      const raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();
      const { getAllCookies } = require("../../database/db");
      const history = getAllCookies().slice(0, 10);
      res.json({ ok: true, current: raw ? raw.substring(0, 100) + "..." : "(empty)", history });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/cookies/update", authMiddleware, (req, res) => {
    const { cookies } = req.body || {};
    if (!cookies || typeof cookies !== "string") {
      return res.status(400).json({ ok: false, error: "Missing or invalid cookies" });
    }
    try {
      const DjamelFCA = require("../../Djamel-fca");
      const parsed    = DjamelFCA.parseCookies(cookies);
      if (!parsed) {
        return res.status(400).json({ ok: false, error: "Could not parse cookies — invalid format" });
      }

      const json = JSON.stringify(parsed, null, 2);
      fs.writeFileSync(ACCOUNT_PATH, json, "utf8");

      const { saveCookie } = require("../../database/db");
      saveCookie(json, "main");

      res.json({ ok: true, message: "Cookies updated. Restart bot to apply." });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  app.get("/api/config", authMiddleware, (req, res) => {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      // Remove sensitive fields before sending
      const safe = { ...cfg };
      delete safe.facebookAccount?.password;
      res.json({ ok: true, config: safe });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/config/update", authMiddleware, (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, error: "Missing key" });

    // Allowed keys for safety
    const allowed = ["botName", "prefix", "timezone", "adminOnly", "stealth", "rateLimit", "panel"];
    const rootKey = key.split(".")[0];
    if (!allowed.includes(rootKey)) {
      return res.status(400).json({ ok: false, error: `Key '${rootKey}' is not editable via panel` });
    }

    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

      // Support dot-notation
      const keys = key.split(".");
      let obj    = cfg;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");

      // Apply to running config
      if (global.CroloBot?.config) {
        const rCfg = global.CroloBot.config;
        let rObj   = rCfg;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!rObj[keys[i]]) rObj[keys[i]] = {};
          rObj = rObj[keys[i]];
        }
        rObj[keys[keys.length - 1]] = value;
      }

      res.json({ ok: true, message: `Config '${key}' updated` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Logs ──────────────────────────────────────────────────────────────────
  app.get("/api/logs", authMiddleware, (req, res) => {
    res.json({ ok: true, logs: _logBuf.slice(-200) });
  });

  // ── Bot actions ───────────────────────────────────────────────────────────
  app.post("/api/bot/restart", authMiddleware, (req, res) => {
    res.json({ ok: true, message: "Bot restarting..." });
    setTimeout(() => process.exit(0), 500);
  });

  // ── Socket.io ─────────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const tok = socket.handshake.query?.token;
    if (!isValidToken(tok)) { socket.disconnect(); return; }
    socket.emit("log_history", _logBuf.slice(-100));
  });

  // ── SPA fallback ──────────────────────────────────────────────────────────
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  server.listen(port, () => {
    console.log(`[PANEL] Admin panel running at http://localhost:${port}`);
  });
}

function fmtUptime(ms) {
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

module.exports = { start };
