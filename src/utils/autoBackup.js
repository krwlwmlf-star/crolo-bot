"use strict";

const fs   = require("fs-extra");
const path = require("path");

const ROOT       = path.join(__dirname, "../..");
const BACKUP_DIR = path.join(ROOT, "backups");
const MAX_BACKUPS = 24;

let _timer = null;

function getTS() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}-${String(d.getMinutes()).padStart(2,"0")}`;
}

async function doBackup() {
  try {
    fs.ensureDirSync(BACKUP_DIR);
    const ts  = getTS();
    const dir = path.join(BACKUP_DIR, ts);
    fs.ensureDirSync(dir);

    const filesToBackup = [
      { src: path.join(ROOT, "account.txt"),              dst: "account.txt" },
      { src: path.join(ROOT, "config.json"),               dst: "config.json" },
      { src: path.join(ROOT, "database/data/bot.db"),      dst: "bot.db"      },
    ];

    let backed = 0;
    for (const { src, dst } of filesToBackup) {
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(dir, dst)); backed++; }
    }

    const all = fs.readdirSync(BACKUP_DIR)
      .filter(n => fs.statSync(path.join(BACKUP_DIR, n)).isDirectory())
      .sort();
    while (all.length > MAX_BACKUPS) {
      const old = all.shift();
      fs.removeSync(path.join(BACKUP_DIR, old));
    }

    const chalk = require("chalk");
    console.log(chalk.green(`💾 نسخة احتياطية → backups/${ts} (${backed} ملفات)`));
  } catch (e) {
    console.error("[autoBackup] خطأ:", e.message);
  }
  scheduleBackup();
}

function scheduleBackup() {
  if (_timer) clearTimeout(_timer);
  const intervalMs = (global.config?.backupIntervalMinutes || 60) * 60 * 1000;
  _timer = setTimeout(doBackup, intervalMs);
}

function start() {
  if (_timer) clearTimeout(_timer);
  scheduleBackup();
}

function stop() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
}

module.exports = { start, stop, doBackup };
