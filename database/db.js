/**
 * Crolo Bot — SQLite Database
 * Stores admins, config overrides, and bot state
 */
"use strict";

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs-extra");

const dbDir  = path.join(process.cwd(), "database/data");
const dbPath = path.join(dbDir, "crolo.sqlite");

fs.ensureDirSync(dbDir);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    userID    TEXT PRIMARY KEY,
    addedBy   TEXT NOT NULL DEFAULT 'system',
    addedAt   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    role      INTEGER NOT NULL DEFAULT 2
  );

  CREATE TABLE IF NOT EXISTS threads (
    threadID  TEXT PRIMARY KEY,
    data      TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS users (
    userID    TEXT PRIMARY KEY,
    data      TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS globals (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS cookies (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    label     TEXT NOT NULL DEFAULT 'main',
    content   TEXT NOT NULL,
    savedAt   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

// ─── Admin Helpers ────────────────────────────────────────────────────────────
function getAllAdmins() {
  return db.prepare("SELECT * FROM admins ORDER BY addedAt ASC").all();
}

function getAdminIDs() {
  return db.prepare("SELECT userID FROM admins").all().map((r) => r.userID);
}

function isAdmin(userID) {
  const row = db.prepare("SELECT 1 FROM admins WHERE userID = ?").get(String(userID));
  return !!row;
}

function addAdmin(userID, addedBy = "system", role = 2) {
  db.prepare(
    "INSERT OR REPLACE INTO admins (userID, addedBy, addedAt, role) VALUES (?, ?, ?, ?)"
  ).run(String(userID), String(addedBy), Date.now(), role);
}

function removeAdmin(userID) {
  db.prepare("DELETE FROM admins WHERE userID = ?").run(String(userID));
}

// ─── Global KV Helpers ─────────────────────────────────────────────────────────
function getGlobal(key, fallback = null) {
  const row = db.prepare("SELECT value FROM globals WHERE key = ?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (_) { return row.value; }
}

function setGlobal(key, value) {
  db.prepare("INSERT OR REPLACE INTO globals (key, value) VALUES (?, ?)").run(
    key,
    typeof value === "string" ? value : JSON.stringify(value)
  );
}

// ─── Cookie Helpers ───────────────────────────────────────────────────────────
function saveCookie(content, label = "main") {
  db.prepare("INSERT INTO cookies (label, content, savedAt) VALUES (?, ?, ?)").run(
    label, content, Date.now()
  );
}

function getLatestCookie(label = "main") {
  return db.prepare(
    "SELECT * FROM cookies WHERE label = ? ORDER BY savedAt DESC LIMIT 1"
  ).get(label);
}

function getAllCookies() {
  return db.prepare("SELECT * FROM cookies ORDER BY savedAt DESC").all();
}

function deleteCookie(id) {
  db.prepare("DELETE FROM cookies WHERE id = ?").run(id);
}

module.exports = {
  db,
  getAllAdmins,
  getAdminIDs,
  isAdmin,
  addAdmin,
  removeAdmin,
  getGlobal,
  setGlobal,
  saveCookie,
  getLatestCookie,
  getAllCookies,
  deleteCookie,
};
