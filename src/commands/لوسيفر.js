"use strict";
const fs   = require("fs-extra");
const path = require("path");

const dataPath = path.join(process.cwd(), "database/data/angelData.json");

function loadData() {
  try { if (fs.existsSync(dataPath)) return JSON.parse(fs.readFileSync(dataPath, "utf8")); } catch {}
  return {};
}
function saveData(data) {
  fs.ensureDirSync(path.dirname(dataPath));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

if (!global._angelIntervals) global._angelIntervals = {};

function randBetween(min, max) {
  if (min >= max) return min;
  return min + Math.random() * (max - min);
}
function getDelayMs(td) {
  const min = td.minSeconds ?? td.intervalSeconds ?? 60;
  const max = td.maxSeconds ?? min;
  return Math.round(randBetween(min, max) * 1000);
}

function scheduleAngel(api, threadID) {
  const data = loadData();
  const td   = data[threadID];
  if (!td || !td.active || !td.message) { delete global._angelIntervals[threadID]; return; }
  const t = setTimeout(async () => {
    const fresh = loadData();
    const ftd   = fresh[threadID];
    if (!ftd || !ftd.active || !ftd.message) { delete global._angelIntervals[threadID]; return; }
    try { await api.sendMessage(ftd.message, threadID); } catch {}
    scheduleAngel(api, threadID);
  }, getDelayMs(td));
  global._angelIntervals[threadID] = t;
}

function restoreIntervals(api) {
  if (global._angelRestored) return;
  global._angelRestored = true;
  const data = loadData();
  let n = 0;
  for (const [tid, td] of Object.entries(data)) {
    if (td.active && td.message && !global._angelIntervals[tid]) { scheduleAngel(api, tid); n++; }
  }
  if (n) console.log(`[لوسيفر] ✅ تمت استعادة ${n} مؤقت`);
}

module.exports = {
  config: {
    name: "لوسيفر",
    aliases: ["angel", "auto-msg"],
    description: "يرسل رسالة تلقائياً بفترة زمنية قابلة للضبط",
    usage: "لوسيفر on/off/change [رسالة]/time [ث]/status",
    role: 2,
  },
  async run({ api, args, threadID, message }) {
    restoreIntervals(api);
    const action = (args[0] || "").toLowerCase();
    const data   = loadData();
    if (!data[threadID]) data[threadID] = { message: null, minSeconds: 60, maxSeconds: 60, active: false };
    const td = data[threadID];

    switch (action) {
      case "change": {
        const msg = args.slice(1).join(" ").trim();
        if (!msg) return message.reply("❌ اكتب الرسالة بعد الأمر.\nمثال: /لوسيفر change مرحباً!");
        td.message = msg;
        saveData(data);
        if (global._angelIntervals[threadID] && td.active) {
          clearTimeout(global._angelIntervals[threadID]);
          delete global._angelIntervals[threadID];
          scheduleAngel(api, threadID);
        }
        return message.reply(`✅ تم تحديث الرسالة:\n"${msg}"`);
      }
      case "time": {
        const v1 = parseFloat(args[1]), v2 = parseFloat(args[2]);
        if (isNaN(v1) || v1 <= 0)
          return message.reply("❌ مثال:\n/لوسيفر time 30\n/لوسيفر time 5 15");
        td.minSeconds = v1;
        td.maxSeconds = (!isNaN(v2) && v2 >= v1) ? v2 : v1;
        saveData(data);
        if (global._angelIntervals[threadID]) {
          clearTimeout(global._angelIntervals[threadID]);
          delete global._angelIntervals[threadID];
          if (td.active && td.message) scheduleAngel(api, threadID);
        }
        const str = td.minSeconds === td.maxSeconds ? `${td.minSeconds}ث` : `${td.minSeconds}–${td.maxSeconds}ث`;
        return message.reply(`✅ الفترة: ${str}`);
      }
      case "on": {
        if (!td.message) return message.reply("❌ حدد الرسالة أولاً:\n/لوسيفر change [رسالتك]");
        if (global._angelIntervals[threadID]) return message.reply("⚠️ لوسيفر يعمل بالفعل.");
        td.active = true;
        saveData(data);
        scheduleAngel(api, threadID);
        const str = td.minSeconds === td.maxSeconds ? `${td.minSeconds}ث` : `${td.minSeconds}–${td.maxSeconds}ث`;
        return message.reply(`✅ تم تشغيل لوسيفر!\n📝 "${td.message}"\n⏱ كل ${str}`);
      }
      case "off": {
        if (!global._angelIntervals[threadID]) return message.reply("⚠️ لوسيفر غير مفعّل.");
        clearTimeout(global._angelIntervals[threadID]);
        delete global._angelIntervals[threadID];
        td.active = false;
        saveData(data);
        return message.reply("✅ تم إيقاف لوسيفر.");
      }
      case "status": {
        const running = !!global._angelIntervals[threadID];
        const str = td.minSeconds === td.maxSeconds ? `${td.minSeconds}ث` : `${td.minSeconds}–${td.maxSeconds}ث`;
        return message.reply(`📊 لوسيفر\n▪ الحالة: ${running ? "🟢 يعمل" : "🔴 متوقف"}\n▪ الرسالة: ${td.message ? `"${td.message}"` : "غير محددة"}\n▪ الفترة: ${str}`);
      }
      default:
        return message.reply("📖 أوامر لوسيفر:\n/لوسيفر change [رسالة]\n/لوسيفر time [ث] أو [أدنى] [أقصى]\n/لوسيفر on\n/لوسيفر off\n/لوسيفر status");
    }
  },
};
