require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const login    = require("@dongdev/fca-unofficial");
const fs       = require("fs-extra");
const path     = require("path");
const gradient = require("gradient-string");
const chalk    = require("chalk");
const moment   = require("moment-timezone");
const cron     = require("node-cron");

const { initDB }            = require("./utils/database");
const { loadCommands }      = require("./utils/loader");
const { parseCookieInput, cookiesToString, hasMandatory, dedup } = require("./utils/cookieParser");
const checkLiveCookie       = require("./utils/checkLiveCookie");
const getFbstateFromToken   = require("./utils/getFbstateFromToken");
const handlerEvents         = require("./handler/handlerEvents");
const { startPoller, stopPoller } = require("./utils/customPoller");

const CONFIG_PATH  = path.join(__dirname, "../config.json");
const ACCOUNT_PATH = path.join(__dirname, "../account.txt");

// ─── Logger ───────────────────────────────────────────────────────────────────
const ts = () => moment().tz(global.config?.timezone || "Africa/Algiers").format("HH:mm:ss");
const log = {
  info:  (msg) => console.log(`${chalk.gray(ts())} ${chalk.cyan("•")} ${msg}`),
  ok:    (msg) => console.log(`${chalk.gray(ts())} ${chalk.green("✔")} ${chalk.green(msg)}`),
  warn:  (msg) => console.log(`${chalk.gray(ts())} ${chalk.yellow("⚠")} ${chalk.yellow(msg)}`),
  error: (msg) => console.log(`${chalk.gray(ts())} ${chalk.red("✘")} ${chalk.red(msg)}`),
};
global.log = log;

// ─── Permissions ──────────────────────────────────────────────────────────────
const isOwner = id => String(id) === String(global.ownerID);
const isAdmin = id => {
  if (isOwner(id)) return true;
  if ((global.config?.adminIDs || []).map(String).includes(String(id))) return true;
  try { return require("../database/db").isAdmin(String(id)); } catch { return false; }
};
global.isOwner = isOwner;
global.isAdmin = isAdmin;

// ─── Stop Current Listener ────────────────────────────────────────────────────
function stopListening() {
  stopPoller();
  try {
    if (global.api && typeof global.api.stopListening === "function") {
      global.api.stopListening(() => {});
    }
  } catch (_) {}
  if (global._currentListener && typeof global._currentListener === "function") {
    try { global._currentListener(); } catch (_) {}
    global._currentListener = null;
  }
  if (global._listenTimer) {
    clearTimeout(global._listenTimer);
    global._listenTimer = null;
  }
  try {
    if (global.api?.ctx?.mqttClient) {
      global.api.ctx.mqttClient.end(true);
    }
  } catch (_) {}
}

// ─── HTTP Long-Poll Listener ─────────────────────────────────────────────────
function startPolling(api, commands, attempt = 1) {
  const MAX = 3;
  log.warn(`HTTP long-poll (محاولة ${attempt}/${MAX})…`);

  let started = false;
  let errored  = false;

  const stop = api.listen((err, event) => {
    if (err) {
      if (errored) return;
      errored = true;
      const msg = String(err.error || err.message || err);
      log.error(`api.listen: ${msg}`);
      if (attempt < MAX) {
        setTimeout(() => startPolling(api, commands, attempt + 1), attempt * 8000);
      } else {
        log.warn("⚡ التحويل إلى Custom Poller…");
        startPoller(api, handlerEvents, global.config?.pollIntervalMs || 5000);
      }
      return;
    }
    if (!started) {
      started = true;
      log.ok(`api.listen نشط ✔ — UID: ${chalk.bold.green(api.getCurrentUserID())}`);
    }
    global._lastActivity = Date.now();
    if (event) handlerEvents(api, event, global.commands).catch(() => {});
  });

  global._currentListener = stop;
}

// ─── MQTT Listener ───────────────────────────────────────────────────────────
function startMqtt(api, commands, attempt = 1) {
  const MAX   = 4;
  const delay = Math.min(attempt * 8000, 40000);

  log.info(`MQTT اتصال (محاولة ${attempt}/${MAX})…`);

  let mqttStarted = false;
  let errored     = false;

  const timer = setTimeout(() => {
    if (!mqttStarted) {
      log.warn("MQTT timeout — تحويل إلى Long-Poll");
      startPolling(api, commands, 1);
    }
  }, 20000);
  global._listenTimer = timer;

  const stop = api.listenMqtt((err, event) => {
    if (err) {
      clearTimeout(timer);
      if (errored) return;
      errored = true;
      const msg = String(err.error || err.message || err.type || err);
      log.warn(`MQTT: ${msg}`);
      if (attempt < MAX) {
        setTimeout(() => startMqtt(api, commands, attempt + 1), delay);
      } else {
        log.warn("فشل MQTT — تحويل إلى Long-Poll");
        startPolling(api, commands, 1);
      }
      return;
    }
    if (!mqttStarted) {
      mqttStarted = true;
      clearTimeout(timer);
      global._listenTimer = null;
      log.ok(`MQTT متصل ✔ — UID: ${chalk.bold.green(api.getCurrentUserID())}`);
    }
    global._lastActivity = Date.now();
    if (event) handlerEvents(api, event, global.commands).catch(() => {});
  });

  global._currentListener = stop;
}

// ─── Load Cookies ─────────────────────────────────────────────────────────────
async function loadCookies() {
  if (!fs.existsSync(ACCOUNT_PATH)) {
    fs.writeFileSync(ACCOUNT_PATH, "", "utf8");
    return null;
  }
  const raw = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();
  if (!raw) return null;

  const UA = global.config?.userAgent ||
    "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

  let parsed;
  try { parsed = parseCookieInput(raw); }
  catch (e) { log.error(`تحليل account.txt: ${e.message}`); return null; }

  if (parsed.isToken) {
    log.info("تحويل التوكن إلى كوكيز…");
    try { return dedup(await getFbstateFromToken(parsed.token)); }
    catch (e) { log.error(`توكن: ${e.message}`); return null; }
  }

  const cookies = parsed.cookies;
  if (!cookies.length) { log.error("account.txt فارغ من الكوكيز"); return null; }
  if (!hasMandatory(cookies)) { log.error("c_user أو xs مفقود"); return null; }

  log.info("التحقق من صلاحية الكوكيز عبر mbasic…");
  const valid = await checkLiveCookie(cookiesToString(cookies), UA);
  log.info(valid ? chalk.green("الكوكيز صالحة ✔") : chalk.yellow("تحذير: لم يتحقق — سنحاول رغم ذلك"));

  return cookies;
}

// ─── Login Lock ──────────────────────────────────────────────────────────────
let _loginLock = false;

// ─── Main Bot Startup ─────────────────────────────────────────────────────────
async function startBot() {
  if (_loginLock) {
    log.warn("تسجيل دخول جارٍ — تجاهل");
    return;
  }
  _loginLock = true;
  stopListening();

  try { require("./protection/stealth").stop(); } catch (_) {}
  try { require("./protection/keepAlive").stop(); } catch (_) {}
  try { require("./protection/mqttHealthCheck").stopHealthCheck(); } catch (_) {}
  global.api = null;

  let cookies;
  try {
    cookies = await loadCookies();
  } catch (e) {
    log.error(`خطأ في تحميل الكوكيز: ${e.message}`);
    cookies = null;
  }

  if (!cookies) {
    log.error("لا توجد كوكيز — أضف cookies إلى account.txt وأعد التشغيل");
    _loginLock = false;
    return;
  }

  const hasMsess = cookies.some(c => c.key === "m_sess");
  if (!hasMsess) log.info(chalk.yellow("m_sess غير موجود — سيستخدم HTTP Long-Poll"));

  const UA = global.config?.userAgent ||
    "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

  const loginOptions = {
    appState:         cookies,
    forceLogin:       false,
    logLevel:         "silent",
    listenEvents:     true,
    selfListen:       false,
    autoReconnect:    false,
    autoMarkDelivery: false,
    autoMarkRead:     false,
    userAgent:        UA,
  };

  const commands = global.commands;
  let loginAttempt = 0;
  const MAX_LOGIN  = 3;

  function tryLogin() {
    loginAttempt++;
    login(loginOptions, async (err, api) => {
      if (err) {
        const msg = err.error || err.message || String(err);
        log.error(`فشل تسجيل الدخول (${loginAttempt}/${MAX_LOGIN}): ${msg}`);
        if (loginAttempt < MAX_LOGIN) {
          setTimeout(tryLogin, loginAttempt * 5000);
          return;
        }
        log.error("وصل لأقصى عدد محاولات تسجيل الدخول");
        _loginLock = false;
        return;
      }

      try {
        const fresh = dedup(api.getAppState() || []);
        if (fresh.length) {
          global._selfWrite = true;
          fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(fresh, null, 2), "utf8");
          setTimeout(() => { global._selfWrite = false; }, 6000);
          log.info(`AppState محدَّث: ${chalk.cyan(fresh.length)} كوكي`);
        }
      } catch (_) {}

      const uid = api.getCurrentUserID();
      log.ok(`تسجيل الدخول ناجح ✔ — UID: ${chalk.bold.green(uid)}`);
      global.api = api;
      global.CroloBot = global.CroloBot || {};
      global.CroloBot.fcaApi = api;
      global.CroloBot.botID  = uid;

      api.setOptions({
        listenEvents:  true,
        selfListen:    false,
        autoReconnect: false,
        userAgent:     UA,
      });

      // حماية الكتابة البشرية (Djamel-fca)
      try { require("./protection/outgoingThrottle").wrapSendMessage(api); } catch (_) {}
      try { require("./protection/humanTyping").wrapWithTyping(api); } catch (_) {}
      try { require("./protection/humanReadReceipt").start(api); } catch (_) {}
      try { require("./protection/reactionDelay").start(api); } catch (_) {}
      try { require("./protection/duplicateGuard").start(api); } catch (_) {}
      try { require("./protection/stealth").start(api); } catch (_) {}
      try { require("./protection/keepAlive").start(); } catch (_) {}
      try { require("./protection/mqttHealthCheck").startHealthCheck(); } catch (_) {}
      try { require("./protection/naturalPresence").start(api); } catch (_) {}
      try { require("./protection/scrollSimulator").start(api); } catch (_) {}
      try { require("./protection/antiDetection").start(); } catch (_) {}
      try { require("./protection/sessionRefresher").start(api); } catch (_) {}
      try { require("./protection/connectionJitter").start(api); } catch (_) {}
      try { require("./protection/typingVariator").start(api); } catch (_) {}
      try { require("./protection/behaviorScheduler").start(); } catch (_) {}

      log.ok("🛡️ جميع أنظمة الحماية نشطة");
      try { require("./utils/autoBackup").start(); } catch (_) {}

      // IPC — broadcast status to panel
      if (process.send) {
        const broadcastStatus = () => {
          try {
            process.send({
              type: "status",
              data: {
                running:    true,
                botID:      api.getCurrentUserID(),
                botName:    global.botName || "Crolo Bot",
                prefix:     global.commandPrefix || "/",
                loginAt:    Date.now(),
                commands:   global.commands?.size || 0,
                nodeVersion: process.version,
                platform:    process.platform,
              },
            });
          } catch {}
        };
        broadcastStatus();
        setInterval(broadcastStatus, 20000);
      }

      setupCronJobs(api);
      _loginLock = false;

      await new Promise(r => setTimeout(r, 1500));
      if (hasMsess) {
        startMqtt(api, commands, 1);
      } else {
        log.info("بدء Long-Poll مباشرة…");
        startPolling(api, commands, 1);
      }
    });
  }

  tryLogin();
}

// ─── Hot-Swap ─────────────────────────────────────────────────────────────────
global.reLoginBot = async function () {
  log.warn("🔄 Hot-Swap: إعادة تسجيل الدخول…");
  _loginLock = false;
  await startBot();
};
global._reLoginBot = global.reLoginBot;

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
function setupCronJobs(api) {
  for (const job of global.config?.cronJobs || []) {
    if (!job.cron || !job.threadID || !job.message) continue;
    try {
      cron.schedule(job.cron, () => api.sendMessage(job.message, job.threadID, () => {}));
      log.ok(`Cron: "${job.cron}" → ${job.threadID}`);
    } catch (e) { log.warn(`Cron: ${e.message}`); }
  }
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function printBanner() {
  const lines = [
    "  ╔══════════════════════════════════════════════════╗",
    "  ║   🤖  Crolo Bot  v3.2.0                         ║",
    "  ║   ⚡  @dongdev/fca-unofficial  |  Jarfis Engine  ║",
    "  ║   🍪  account.txt  —  No m_sess required        ║",
    "  ║   🔄  Hot-Swap  |  Auto-Backup  |  MQTT→Poll    ║",
    "  ╚══════════════════════════════════════════════════╝",
  ].join("\n");
  console.log(gradient(["#00b4d8", "#0077b6", "#023e8a"])(lines));
  console.log(chalk.gray(`  ${moment().tz("Africa/Algiers").format("YYYY-MM-DD HH:mm:ss")}\n`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  printBanner();
  await initDB();
  log.ok("قاعدة البيانات جاهزة");

  if (!global._lockedThreads) global._lockedThreads = new Set();
  if (global._globalLock === undefined) global._globalLock = false;
  if (!global._broadcasts)    global._broadcasts    = new Map();
  if (!global._nicknameJobs)  global._nicknameJobs  = new Map();

  const defaults = {
    botName: "Crolo Bot",
    prefix: "/",
    ownerID: "61589770358193",
    adminIDs: ["61589770358193"],
    dashboardPort: 5000,
    timezone: "Africa/Algiers",
    dashboardPassword: "Crolo2026",
    humanTyping:     { enable: true },
    stealth:         { enable: true },
    mqttHealthCheck: { enable: true },
    keepAlive:       { enable: true },
    groupEvents:     { welcomeMessage: "", leaveMessage: "" },
    backupIntervalMinutes: 60,
    cronJobs: [],
    commandRoles: {},
    userAgent: "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36",
  };

  const config = fs.existsSync(CONFIG_PATH)
    ? { ...defaults, ...fs.readJsonSync(CONFIG_PATH) }
    : defaults;

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeJsonSync(CONFIG_PATH, defaults, { spaces: 2 });
    log.warn("config.json تم إنشاؤه بالقيم الافتراضية");
  }

  global.config        = config;
  global.commandPrefix = config.prefix   || "/";
  global.ownerID       = config.ownerID  || "";
  global.botName       = config.botName  || "Crolo Bot";

  // دعم globals القديمة (CroloBot)
  global.CroloBot = {
    startTime: Date.now(),
    config,
    commands:  new Map(),
    aliases:   new Map(),
    pending:   new Map(),
    locked:    { names: new Map(), nicknames: new Map(), autoRejoin: new Set() },
    fcaApi:    null,
    botID:     null,
  };

  log.info(`البوت: ${chalk.bold.cyan(global.botName)} | بادئة: ${chalk.cyan(global.commandPrefix)} | مالك: ${chalk.cyan(global.ownerID || "غير محدد")}`);

  const commands = loadCommands(path.join(__dirname, "commands"));
  global.commands          = commands;
  global.CroloBot.commands = commands;
  log.ok(`تم تحميل ${chalk.bold(commands.size)} أمر`);

  if (!fs.existsSync(ACCOUNT_PATH)) fs.writeFileSync(ACCOUNT_PATH, "", "utf8");

  // File Watcher — تغيير account.txt → hot-swap
  let _watchMtime = 0;
  let _watchTimer = null;

  const SIGNAL_PATH = path.join(__dirname, "../database/data/.panel_write");

  fs.watch(ACCOUNT_PATH, () => {
    if (_watchTimer) return;
    _watchTimer = setTimeout(async () => {
      _watchTimer = null;
      if (global._selfWrite || _loginLock) return;
      // Check signal file (panel wrote this file — don't auto hot-swap)
      try {
        if (fs.existsSync(SIGNAL_PATH)) {
          const sig = JSON.parse(fs.readFileSync(SIGNAL_PATH, "utf8") || "{}");
          if (Date.now() - (sig.ts || 0) < 30000) { fs.removeSync(SIGNAL_PATH); return; }
          fs.removeSync(SIGNAL_PATH);
        }
      } catch {}
      try {
        const stat = fs.statSync(ACCOUNT_PATH);
        if (stat.mtimeMs <= _watchMtime + 500) return;
        _watchMtime = stat.mtimeMs;
      } catch { return; }
      const content = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();
      if (!content) return;
      log.warn("🔄 account.txt تغيَّر — hot-swap بعد 3s…");
      setTimeout(() => startBot(), 3000);
    }, 5000);
  });

  // IPC from panel
  if (process.send) {
    process.on("message", async (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "relogin") {
        log.warn("🔄 IPC: إعادة تسجيل الدخول (طلب الواجهة)…");
        _loginLock = false;
        setTimeout(() => startBot(), 500);
      }
      if (msg.type === "reload_admins") {
        try {
          const fresh = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
          if (global.config) global.config.adminIDs = fresh.adminIDs || [];
          log.info("♻ قائمة الأدمن محدَّثة");
        } catch {}
      }
    });
    process.on("disconnect", () => { log.warn("IPC انقطع — الإغلاق"); process.exit(0); });
  }

  await startBot();
}

main().catch(e => {
  console.error(chalk.red("FATAL:"), e);
  process.exit(1);
});
