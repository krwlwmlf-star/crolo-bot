#!/usr/bin/env node
"use strict";

/**
 * push-to-github.js — رفع جميع ملفات Crolo Bot إلى GitHub
 * الاستخدام: node scripts/push-to-github.js
 *
 * المتطلبات: node >= 18 (fetch built-in)
 * أو: npm install node-fetch  ثم غيّر const fetch = require('node-fetch')
 */

const fs   = require("fs");
const path = require("path");

// ── إعدادات ─────────────────────────────────────────────────────────────────
const TOKEN  = process.env.GITHUB_TOKEN || "";
const OWNER  = "krwlwmlf-star";
const REPO   = "crolo-bot";
const BRANCH = "main";

// الملفات التي سيتم رفعها (مسارات نسبية من جذر المشروع)
const FILES_TO_PUSH = [
  "index.js",
  "package.json",
  "config.json",
  "railway.toml",
  "scripts/patch-fca.js",
  "scripts/push-to-github.js",
  "src/index.js",
  "src/handler/handlerEvents.js",
  "src/utils/loader.js",
  "src/utils/cookieParser.js",
  "src/utils/checkLiveCookie.js",
  "src/utils/getMsess.js",
  "src/utils/database.js",
  "src/utils/getFbstateFromToken.js",
  "src/utils/autoBackup.js",
  "src/utils/customPoller.js",
  "src/utils/threadsData.js",
  "src/protection/humanTyping.js",
  "src/protection/keepAlive.js",
  "src/protection/mqttHealthCheck.js",
  "src/protection/stealth.js",
  "src/protection/outgoingThrottle.js",
  "src/protection/humanReadReceipt.js",
  "src/protection/rateLimit.js",
  "src/protection/naturalPresence.js",
  "src/protection/scrollSimulator.js",
  "src/protection/antiDetection.js",
  "src/protection/sessionRefresher.js",
  "src/protection/reactionDelay.js",
  "src/protection/connectionJitter.js",
  "src/protection/duplicateGuard.js",
  "src/protection/typingVariator.js",
  "src/protection/behaviorScheduler.js",
  "src/protection/Uprotection.js",
  "src/panel/server.js",
  "src/panel/public/index.html",
  "src/commands/help.js",
  "src/commands/setbotnick.js",
  "src/commands/adminadd.js",
  "src/commands/adminremove.js",
  "src/commands/uptime.js",
  "src/commands/kick.js",
  "src/commands/lockname.js",
  "src/commands/locknick.js",
  "src/commands/autorejoin.js",
  "src/commands/spam.js",
  "src/commands/memes.js",
  "src/commands/pinterest.js",
  "src/commands/jarayed.js",
  "src/commands/\u0645\u062d\u0627\u062f\u062b\u0627\u062a.js",
  "src/commands/\u0643\u0646\u064a\u0627\u062a.js",
  "src/commands/\u0627\u0633\u0645.js",
  "src/commands/\u062a\u0648\u0642\u064a\u0641-\u0627\u0633\u0645.js",
  "src/commands/\u0644\u0648\u0633\u064a\u0641\u0631.js",
  "database/db.js",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, "..");
const API  = `https://api.github.com/repos/${OWNER}/${REPO}`;
const HDR  = {
  "Authorization": `token ${TOKEN}`,
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "crolo-bot-push-script",
  "Content-Type": "application/json",
};

async function apiGet(url) {
  const r = await fetch(url, { headers: HDR });
  if (r.status === 404) return null;
  const j = await r.json();
  if (j.message && r.status >= 400) throw new Error(`API ${r.status}: ${j.message}`);
  return j;
}

async function apiPut(url, body) {
  const r = await fetch(url, { method: "PUT", headers: HDR, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.message && r.status >= 400) throw new Error(`API ${r.status}: ${j.message} — ${url}`);
  return j;
}

function toBase64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Crolo Bot — GitHub Push Script");
  console.log(`   Repo: ${OWNER}/${REPO} | Branch: ${BRANCH}\n`);

  // تحقق من الاتصال
  const repoInfo = await apiGet(API);
  if (!repoInfo) throw new Error("الريبو غير موجود أو التوكن لا يملك صلاحية");
  console.log(`✅ الريبو موجود: ${repoInfo.full_name} (${repoInfo.visibility})\n`);

  let success = 0, failed = 0, skipped = 0;

  for (const relPath of FILES_TO_PUSH) {
    const absPath = path.join(ROOT, relPath);
    const apiPath = relPath.replace(/\\/g, "/");

    if (!fs.existsSync(absPath)) {
      console.log(`⚠️  مفقود محليًا: ${relPath}`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(absPath, "utf8");
    const encoded = toBase64(content);

    // افحص إذا كان الملف موجودًا على GitHub
    let sha = null;
    try {
      const existing = await apiGet(`${API}/contents/${apiPath}?ref=${BRANCH}`);
      if (existing && existing.sha) sha = existing.sha;
    } catch (_) {}

    const body = {
      message: `chore: update ${apiPath}`,
      content: encoded,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    try {
      await apiPut(`${API}/contents/${apiPath}`, body);
      const action = sha ? "✏️  محدَّث" : "➕ أضيف ";
      console.log(`${action}: ${relPath}`);
      success++;
    } catch (e) {
      console.error(`❌ فشل ${relPath}: ${e.message}`);
      failed++;
    }

    // تأخير صغير لتجنب rate limit
    await sleep(300);
  }

  console.log(`\n═══════════════════════════════`);
  console.log(`✅ ناجح  : ${success}`);
  console.log(`⚠️  محذوف : ${skipped}`);
  console.log(`❌ فاشل  : ${failed}`);
  console.log(`═══════════════════════════════`);
  console.log(`\n🎉 انتهى! تحقق من: https://github.com/${OWNER}/${REPO}`);
}

main().catch(e => {
  console.error("\n💥 خطأ:", e.message);
  process.exit(1);
});
