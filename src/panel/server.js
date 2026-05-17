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
const SIGNAL_PATH  = path.join(ROOT, "database/data/.panel_write");
const DB_DIR       = path.join(ROOT, "database/data");

let _io     = null;
let _server = null;
let _logBuf = [];
const MAX_LOG = 500;

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

  console.log   = (...a) => { origLog(...a);   capture("info",  a); };
  console.error = (...a) => { origError(...a); capture("error", a); };
  console.warn  = (...a) => { origWarn(...a);  capture("warn",  a); };
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = [];
  if (d) p.push(`${d}d`); if (h) p.push(`${h}h`);
  if (m) p.push(`${m}m`); p.push(`${sec}s`);
  return p.join(" ");
}

function getBotMgr()    { return global.botManager || null; }
function getLiveData()  { return global.botLiveData || {}; }
function isLiveRecent() { const l = getLiveData(); return !!(l.receivedAt && Date.now() - l.receivedAt < 90000); }

function writeSignal() {
  try { fs.ensureDirSync(DB_DIR); fs.writeFileSync(SIGNAL_PATH, JSON.stringify({ ts: Date.now() })); } catch {}
}

function start(config = {}) {
  const port     = process.env.PORT || config?.panel?.port || 5000;
  const password = config?.panel?.password || "Crolo2026";

  interceptLogs();

  const app    = express();
  const server = http.createServer(app);
  const io     = socketio(server, { cors: { origin: "*" } });
  _io     = io;
  _server = server;

  app.use(bodyParser.json({ limit: "4mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/login", (req, res) => {
    const { password: pw } = req.body || {};
    let cfg = config;
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch {}
    const correct = cfg?.panel?.password || password;
    if (pw !== correct) return res.status(401).json({ ok: false, error: "كلمة المرور خاطئة" });
    res.json({ ok: true, token: genToken() });
  });

  app.post("/api/logout", authMiddleware, (req, res) => {
    _tokens.delete(req.headers["x-crolo-token"] || req.query.token);
    res.json({ ok: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/stats", authMiddleware, (req, res) => {
    const live    = getLiveData();
    const recent  = isLiveRecent();
    const botMgr  = getBotMgr();
    const botStatus = botMgr ? botMgr.getBotStatus() : { running: false };
    const panelStart = global.CroloBot?.startTime || Date.now();
    const upMs    = Date.now() - panelStart;
    const mem     = process.memoryUsage();

    let adminCount = 0;
    try { const { getAllAdmins } = require("../../database/db"); adminCount = getAllAdmins().length; } catch {}

    let cmdCount = 0;
    try { cmdCount = require("fs").readdirSync(path.join(__dirname, "../../src/commands")).filter(f => f.endsWith(".js")).length; } catch {}

    res.json({
      ok:          true,
      uptime:      upMs,
      uptimeStr:   fmtUptime(upMs),
      botID:       recent ? (live.botID || null) : null,
      botName:     live.botName || config?.botName || "Crolo Bot",
      prefix:      live.prefix  || config?.prefix  || "/",
      commands:    recent ? (live.commands || cmdCount) : cmdCount,
      adminCount,
      memory:      { rss: Math.round(mem.rss/1024/1024), heapUsed: Math.round(mem.heapUsed/1024/1024), heapTotal: Math.round(mem.heapTotal/1024/1024) },
      nodeVersion: live.nodeVersion || process.version,
      platform:    live.platform    || process.platform,
      adminOnly:   true,
      botProcess:  botStatus,
      hasCookies:  botMgr ? botMgr.hasCookies() : false,
    });
  });

  // ── Bot controls ──────────────────────────────────────────────────────────
  app.get("/api/bot/status", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: true, running: false, managed: false });
    res.json({ ok: true, managed: true, ...botMgr.getBotStatus() });
  });

  app.post("/api/bot/start", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: false, error: "Bot manager غير متوفر" });
    if (!botMgr.hasCookies()) return res.status(400).json({ ok: false, error: "لا توجد كوكيز — أضفها أولاً." });
    botMgr.startBot !== undefined && (botMgr.startBot._autoRestart = true);
    const started = botMgr.startBot();
    res.json({ ok: true, message: started ? "البوت يبدأ…" : "البوت شغّال بالفعل" });
  });

  app.post("/api/bot/stop", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: false, error: "Bot manager غير متوفر" });
    botMgr.stopBot();
    global.botLiveData = null;
    res.json({ ok: true, message: "البوت أُوقف" });
  });

  app.post("/api/bot/restart", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (botMgr) {
      const status = botMgr.getBotStatus();
      if (status.running) {
        // In-process hot-swap (no process restart)
        res.json({ ok: true, message: "إعادة تسجيل الدخول (hot-swap)…" });
        setTimeout(() => botMgr.sendToBot?.({ type: "relogin" }), 200);
      } else {
        res.json({ ok: true, message: "البوت يبدأ…" });
        setTimeout(() => botMgr.restartBot(), 300);
      }
    } else {
      res.json({ ok: true, message: "إعادة تشغيل العملية…" });
      setTimeout(() => process.exit(0), 500);
    }
  });

  app.post("/api/bot/hotswap", authMiddleware, (req, res) => {
    const botMgr = getBotMgr();
    if (!botMgr) return res.json({ ok: false, error: "Bot manager غير متوفر" });
    botMgr.sendToBot?.({ type: "relogin" });
    res.json({ ok: true, message: "hot-swap مُطلَق…" });
  });

  // ── Admins ────────────────────────────────────────────────────────────────
  app.get("/api/admins", authMiddleware, (req, res) => {
    try {
      const { getAllAdmins } = require("../../database/db");
      res.json({ ok: true, admins: getAllAdmins() });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post("/api/admins/add", authMiddleware, (req, res) => {
    const { userID, role } = req.body || {};
    if (!userID || !/^\d+$/.test(String(userID)))
      return res.status(400).json({ ok: false, error: "userID غير صالح" });
    try {
      const { addAdmin, isAdmin } = require("../../database/db");
      if (isAdmin(String(userID)))
        return res.status(400).json({ ok: false, error: "هذا المستخدم أدمن بالفعل" });
      addAdmin(String(userID), "panel", role || 2);

      // Persist to config.json
      try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        if (!Array.isArray(cfg.adminIDs)) cfg.adminIDs = [];
        if (!cfg.adminIDs.map(String).includes(String(userID))) {
          cfg.adminIDs.push(String(userID));
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        }
      } catch {}

      // Notify bot process
      getBotMgr()?.sendToBot?.({ type: "reload_admins" });

      res.json({ ok: true, message: `تمت إضافة ${userID} كأدمن` });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post("/api/admins/remove", authMiddleware, (req, res) => {
    const { userID } = req.body || {};
    if (!userID) return res.status(400).json({ ok: false, error: "userID مطلوب" });
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (String(userID) === String(cfg.ownerID || ""))
        return res.status(400).json({ ok: false, error: "لا يمكن حذف المالك" });
    } catch {}
    try {
      const { removeAdmin } = require("../../database/db");
      removeAdmin(String(userID));

      // Remove from config.json
      try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        if (Array.isArray(cfg.adminIDs)) {
          cfg.adminIDs = cfg.adminIDs.filter(id => String(id) !== String(userID));
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        }
      } catch {}

      // Notify bot process
      getBotMgr()?.sendToBot?.({ type: "reload_admins" });

      res.json({ ok: true, message: `تمت إزالة ${userID} من الأدمن` });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  app.get("/api/cookies", authMiddleware, (req, res) => {
    try {
      let raw = "";
      try { raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim(); } catch {}
      const history = (() => { try { return require("../../database/db").getAllCookies().slice(0, 10); } catch { return []; } })();
      res.json({
        ok: true,
        current:    raw ? raw.substring(0, 120) + "…" : "(فارغ — لا كوكيز)",
        hasCookies: raw.length > 10,
        history,
      });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post("/api/cookies/update", authMiddleware, (req, res) => {
    const { cookies } = req.body || {};
    if (!cookies || typeof cookies !== "string")
      return res.status(400).json({ ok: false, error: "كوكيز مفقودة أو غير صالحة" });
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
        writeSignal();
        fs.writeFileSync(ACCOUNT_PATH, cookies.trim(), "utf8");
        try { require("../../database/db").saveCookie(cookies.trim(), "token"); } catch {}
        console.log("[PANEL] Token saved");
        return res.json({ ok: true, message: "✓ التوكن محفوظ. اضغط Start Bot لتشغيل البوت." });
      }

      if (!parsed || !parsed.length)
        return res.status(400).json({ ok: false, error: "لم يُتعرَّف على كوكيز صالحة." });
      if (!hasMandatory(parsed))
        return res.status(400).json({ ok: false, error: "الكوكيز غير صالحة — c_user أو xs مفقودان." });

      const json = JSON.stringify(parsed, null, 2);
      writeSignal();
      fs.writeFileSync(ACCOUNT_PATH, json, "utf8");
      try { require("../../database/db").saveCookie(json, "main"); } catch {}

      console.log(`[PANEL] Cookies updated (${parsed.length} cookies)`);
      res.json({ ok: true, message: `✓ ${parsed.length} كوكي محفوظة. اضغط Start Bot أو Restart للتطبيق.` });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  app.get("/api/config", authMiddleware, (req, res) => {
    try {
      const cfg  = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const safe = { ...cfg };
      delete safe.facebookAccount;
      res.json({ ok: true, config: safe });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post("/api/config/update", authMiddleware, (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, error: "key مطلوب" });
    const allowed = ["botName", "prefix", "timezone", "adminOnly", "stealth", "rateLimit", "panel"];
    if (!allowed.includes(key.split(".")[0]))
      return res.status(400).json({ ok: false, error: `المفتاح '${key.split(".")[0]}' غير قابل للتعديل` });
    try {
      const cfg  = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const keys = key.split(".");
      let obj    = cfg;
      for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]]; }
      obj[keys[keys.length - 1]] = value;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      getBotMgr()?.sendToBot?.({ type: "reload_admins" });
      res.json({ ok: true, message: `Config '${key}' updated` });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
