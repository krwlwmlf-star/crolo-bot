"use strict";
const { db } = require("../../database/db");

const threadsData = {
  async get(threadID, key) {
    try {
      const row = db.prepare("SELECT data FROM threads WHERE threadID = ?").get(String(threadID));
      if (!row) return null;
      const data = JSON.parse(row.data || "{}");
      if (!key) return data;
      return key.split(".").reduce((o, k) => (o != null && typeof o === "object" ? o[k] : undefined), data) ?? null;
    } catch { return null; }
  },
  async set(threadID, value, key) {
    try {
      const row = db.prepare("SELECT data FROM threads WHERE threadID = ?").get(String(threadID));
      let data = {};
      try { data = JSON.parse(row?.data || "{}"); } catch {}
      if (!key) {
        data = typeof value === "object" && value !== null ? value : {};
      } else {
        const keys = key.split(".");
        let obj = data;
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof obj[keys[i]] !== "object" || obj[keys[i]] === null) obj[keys[i]] = {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
      }
      db.prepare("INSERT OR REPLACE INTO threads (threadID, data) VALUES (?, ?)").run(
        String(threadID), JSON.stringify(data)
      );
    } catch (e) { console.error("[threadsData] set error:", e.message); }
  },
};

module.exports = threadsData;
