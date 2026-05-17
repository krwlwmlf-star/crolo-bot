/**
 * Crolo Bot — Admin Panel Server
 * David-bot style: panel manages the bot process lifecycle
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
  _tokens.set(tok, Date.now() + 4 * 60 * 60 * 1000);
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
  const origWarn  = console.warn.bind(console);

  function capture(level, args) {
    const line  = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    const entry = { ts: Date.now(), level, msg: clean };
    _logBuf.push(entry);
    if (_logBuf.length > MAX_LOG) _logBuf.shift();
    if (_io) _io.emit("log", entry);
  }

  console.log   = (...args) => { origLog(...args);   capture("info",  args); };
  console.error = (...args) => { origError(...args); capture("error", args); };
  console.warn  = (...args) => { origWarn(...args);  capture("warn",  args); };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function getBotMgr() {
  return global.botManager || null;
}

// ── Start panel ───────────────────────────────────────────────────────────────
function start(config = {}) {
  const port     = process.env.PORT || config?.panel?.port || 3000;
  const password = config?.panel?.password || "Crolo2026";

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
    let cfg = config;
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch (_) {}
    const correct = cfg?.panel?.password || password;
    if (pw !== correct) return res.status(401).json({ ok: false, error: "Wrong password" });
    res.json({ ok: true, token: genToken() });
  });

  app.post("/api/logout", authMiddleware, (req, res) => {
    const tok = req.headers["x-crolo-token"] || req.query.token;
    _tokens.delete(tok);
    res.json({ ok: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", authMiddleware, (req, res) => {
    try { require("../../database/db"); } catch (_) {}
    const { getAllAdmins } = require("../../database/db");
    const panelStart = global.CroloBot?.startTime || Date.now();
    const upMs       = Date.now() - panelStart;
    const mem        = process.memoryUsage();
    const botMgr     = getBotMgr();
    const botStatus  = botMgr ? botMgr.getBotStatus() : { running: false };

    res.json({
      ok: true,
      uptime:     upMs,
      uptimeStr:  fmtUptime(upMs),
      botID:      global.CroloBot?.botID || null,
      commands:   (() => { try { return require("fs").readdirSync(require("path").join(__dirname, "../../src/commands")).filter(f => f.endsWith(".js")).length; } catch(_) { return 0; } })(),
      adminCount: (() => { try { return getAllAdmins().length; } catch (_) { return 0; } })(),
      memory: {
        rss:       Math.round(mem.rss / 1024 / 1024),
        heapUsed:  Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      nodeVersion:  process.version,
      platform:     process.platform,
      botName:      global.CroloBot?.config?.botName   || config?.botName   || "Crolo Bot",
      prefix:       global.CroloBot?.config?.prefix    || config?.prefix    || "/",
      adminOnly:    global.CroloBot?.config?.adminOnly?.enable !== false,
      botProcess:   botStatus,
      hasCookies:   botMgr ? botMgr.hasCookies() : false,
    });
  });

  // ── Bot process control ───────────────────────────────────────────────────
  app.get("/api/bot/status", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: true, running: false, managed: false });
    res.json({ ok: true, managed: true, ...botMgr.getBotStatus() });
  });

  app.post("/api/bot/start", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: false, error: "Bot manager not available" });
    if (!botMgr.hasCookies()) {
      return res.status(400).json({ ok: false, error: "No cookies found. Add cookies first." });
    }
    const started = botMgr.startBot();
    res.json({ ok: true, message: started ? "Bot starting..." : "Bot is already running" });
  });

  app.post("/api/bot/stop", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: false, error: "Bot manager not available" });
    botMgr.stopBot();
    res.json({ ok: true, message: "Bot stopped" });
  });

  app.post("/api/bot/restart", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (botMgr) {
      res.json({ ok: true, message: "Bot restarting..." });
      setTimeout(() => botMgr.restartBot(), 300);
    } else {
      // Fallback: exit process so watchdog restarts it
      res.json({ ok: true, message: "Restarting process..." });
      setTimeout(() => process.exit(0), 500);
    }
  });

  // ── Admins ────────────────────────────────────────────────────────────────
  app.get("/api/admins", authMiddleware, (req, res) => {
    const { getAllAdmins } = require("../../database/db");
    res.json({ ok: true, admins: getAllAdmins() });
  });

  app.post("/api/admins/add", authMiddleware, (req, res) => {
    const { userID, role } = req.body || {};
    if (!userID || !/^\d+$/.test(String(userID)))
      return res.status(400).json({ ok: false, error: "Invalid userID" });
    try {
      const { addAdmin, isAdmin } = require("../../database/db");
      if (isAdmin(String(userID)))
        return res.status(400).json({ ok: false, error: "Already an admin" });
      addAdmin(String(userID), "panel", role || 2);
      if (global.CroloBot?.config) {
        if (!Array.isArray(global.CroloBot.config.adminBot)) global.CroloBot.config.adminBot = [];
        if (!global.CroloBot.config.adminBot.map(String).includes(String(userID)))
          global.CroloBot.config.adminBot.push(String(userID));
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
    if (String(userID) === ownerID)
      return res.status(400).json({ ok: false, error: "Cannot remove owner" });
    try {
      const { removeAdmin } = require("../../database/db");
      removeAdmin(String(userID));
      if (global.CroloBot?.config?.adminBot)
        global.CroloBot.config.adminBot = global.CroloBot.config.adminBot.filter(
          (id) => String(id) !== String(userID)
        );
      res.json({ ok: true, message: `User ${userID} removed from admins` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  app.get("/api/cookies", authMiddleware, (req, res) => {
    try {
      let raw = "";
      try { raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim(); } catch (_) {}
      const { getAllCookies } = require("../../database/db");
      const history = (() => { try { return getAllCookies().slice(0, 10); } catch (_) { return []; } })();
      res.json({
        ok: true,
        current:    raw ? raw.substring(0, 120) + "..." : "(empty — no cookies set)",
        hasCookies: raw.length > 10,
        history,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/cookies/update", authMiddleware, (req, res) => {
    const { cookies } = req.body || {};
    if (!cookies || typeof cookies !== "string")
      return res.status(400).json({ ok: false, error: "Missing or invalid cookies" });

    try {
      const { parseCookieInput, hasMandatory } = require("../utils/cookieParser");
      let parsed, isToken = false;
      try {
        const result = parseCookieInput(cookies);
        parsed  = result.cookies;
        isToken = result.isToken;
      } catch (pe) {
        return res.status(400).json({ ok: false, error: "صيغة الكوكيز غير مدعومة: " + pe.message });
      }

      if (isToken) {
        // Token — save as-is for getFbstateFromToken to handle on next start
        fs.writeFileSync(ACCOUNT_PATH, cookies.trim(), "utf8");
        global._dashCookieWrite = true;
        setTimeout(() => { global._dashCookieWrite = false; }, 6000);
        console.log("[PANEL] Token saved — will convert on next bot start");
        return res.json({ ok: true, message: "✓ التوكن محفوظ. اضغط Start Bot لتشغيل البوت." });
      }

      if (!parsed || !parsed.length)
        return res.status(400).json({ ok: false, error: "لم يتم التعرف على كوكيز صالحة في المدخل." });

      if (!hasMandatory(parsed))
        return res.status(400).json({ ok: false, error: "الكوكيز تبدو غير صالحة — c_user أو xs مفقودان." });

      const json = JSON.stringify(parsed, null, 2);
      global._dashCookieWrite = true;
      fs.writeFileSync(ACCOUNT_PATH, json, "utf8");
      setTimeout(() => { global._dashCookieWrite = false; }, 6000);

      try {
        const { saveCookie } = require("../../database/db");
        saveCookie(json, "main");
      } catch (_) {}

      console.log(`[PANEL] Cookies updated (${parsed.length} cookies)`);
      res.json({ ok: true, message: `✓ ${parsed.length} كوكي محفوظة. اضغط Start Bot أو Restart للتطبيق.` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  app.get("/api/config", authMiddleware, (req, res) => {
    try {
      const cfg  = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const safe = { ...cfg };
      if (safe.facebookAccount) delete safe.facebookAccount.password;
      res.json({ ok: true, config: safe });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/config/update", authMiddleware, (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, error: "Missing key" });
    const allowed = ["botName", "prefix", "timezone", "adminOnly", "stealth", "rateLimit", "panel"];
    if (!allowed.includes(key.split(".")[0]))
      return res.status(400).json({ ok: false, error: `Key '${key.split(".")[0]}' is not editable via panel` });
    try {
      const cfg  = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const keys = key.split(".");
      let obj    = cfg;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
      if (global.CroloBot?.config) {
        let rObj = global.CroloBot.config;
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

  server.listen(port, "0.0.0.0", () => {
    console.log(`[PANEL] Admin panel running at http://0.0.0.0:${port}`);
  });
}

module.exports = { start };
