"use strict";

/**
 * patch-fca.js — Patches @dongdev/fca-unofficial after npm install
 * 1. changeGroupImage.js — adds missing parseAndCheckLogin import
 * 2. getSeqID.js         — adds MQTT bypass for error 1357004 (no m_sess)
 */

const fs   = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "node_modules", "@dongdev", "fca-unofficial");

if (!fs.existsSync(BASE)) {
  console.log("[patch-fca] @dongdev/fca-unofficial not installed yet — skipping patches");
  process.exit(0);
}

// ── PATCH 1: changeGroupImage.js ─────────────────────────────────────────────
const CANDIDATE_PATHS = [
  path.join(BASE, "src", "api", "messaging", "changeGroupImage.js"),
  path.join(BASE, "src", "api", "changeGroupImage.js"),
  path.join(BASE, "src", "changeGroupImage.js"),
  path.join(BASE, "changeGroupImage.js"),
];

const IMPORT_VARIANTS = [
  'const { parseAndCheckLogin } = require("../../utils/client");',
  'const { parseAndCheckLogin } = require("../utils/client");',
  'const { parseAndCheckLogin } = require("./utils/client");',
];

const ANCHOR_LINES = [
  'const log = require("../../../func/logAdapter");',
  'const log = require("../../func/logAdapter");',
  'const log = require("../func/logAdapter");',
  '"use strict";',
  "'use strict';",
];

function resolveImportLine(targetFile) {
  const dir = path.dirname(targetFile);
  const candidates = [
    { line: IMPORT_VARIANTS[0], rel: "../../utils/client.js" },
    { line: IMPORT_VARIANTS[1], rel: "../utils/client.js"   },
    { line: IMPORT_VARIANTS[2], rel: "./utils/client.js"    },
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.resolve(dir, c.rel))) return c.line;
  }
  return IMPORT_VARIANTS[0];
}

function isAlreadyPatched1(content) {
  return /require\s*\([^)]*parseAndCheckLogin[^)]*\)/.test(content) ||
         /\{\s*parseAndCheckLogin\s*\}\s*=\s*require/.test(content);
}

function patchContent(content, importLine) {
  if (isAlreadyPatched1(content)) return null;
  for (const anchor of ANCHOR_LINES) {
    const idx = content.indexOf(anchor);
    if (idx !== -1) {
      const insertPos = idx + anchor.length;
      return content.slice(0, insertPos) + "\n" + importLine + content.slice(insertPos);
    }
  }
  return importLine + "\n" + content;
}

let patched1 = false;

for (const target of CANDIDATE_PATHS) {
  if (!fs.existsSync(target)) continue;
  console.log(`[patch-fca] found: ${path.relative(process.cwd(), target)}`);
  try {
    const original   = fs.readFileSync(target, "utf8");
    const importLine = resolveImportLine(target);
    const result     = patchContent(original, importLine);
    if (!result) { console.log("[patch-fca] changeGroupImage already patched."); patched1 = true; break; }
    fs.writeFileSync(target, result, "utf8");
    console.log(`[patch-fca] changeGroupImage patched OK`);
    patched1 = true;
    break;
  } catch (err) {
    console.warn(`[patch-fca] changeGroupImage failed: ${err.message}`);
  }
}

if (!patched1) {
  console.log("[patch-fca] changeGroupImage target not found — skipping");
}

// ── PATCH 2: getSeqID.js (MQTT bypass error 1357004) ─────────────────────────
const SEQ_ID_FILE = path.join(BASE, "src", "api", "socket", "core", "getSeqID.js");

const SEQ_PATCH_MARKER = "CROLO-PATCH";

const SEQ_OLD = `.catch(async err => {
        const detail = (err && err.detail && err.detail.message) ? \` | detail=\${err.detail.message}\` : "";
        const msg = ((err && err.error) || (err && err.message) || String(err || "")) + detail;

        // Check if this is an auth-related error
        const isAuthError = /Not logged in|no sync_sequence_id found|blocked the login|401|403/i.test(msg);`;

const SEQ_NEW = `.catch(async err => {
        const detail = (err && err.detail && err.detail.message) ? \` | detail=\${err.detail.message}\` : "";
        const msg = ((err && err.error) || (err && err.message) || String(err || "")) + detail;

        // ${SEQ_PATCH_MARKER}: Detect error 1357004 (no m_sess) — bypass getSeqID, start MQTT with seqId=1
        const origErr = (err && err.originalResponse && err.originalResponse.error) || 0;
        if (origErr === 1357004 || /1357004/.test(JSON.stringify((err && err.originalResponse) || ""))) {
          logger("getSeqID: error 1357004 detected (no m_sess) — bypassing API, starting MQTT directly with seqId=1", "warn");
          if (!ctx.lastSeqId || ctx.lastSeqId < 1) ctx.lastSeqId = 1;
          try {
            listenMqtt(defaultFuncs, api, ctx, globalCallback);
            return;
          } catch (mqttBypassErr) {
            logger(\`getSeqID: MQTT bypass failed: \${mqttBypassErr && mqttBypassErr.message ? mqttBypassErr.message : mqttBypassErr}\`, "error");
          }
        }

        // Check if this is an auth-related error
        const isAuthError = /Not logged in|no sync_sequence_id found|blocked the login|401|403/i.test(msg);`;

function patchGetSeqID(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-fca] getSeqID.js not found at ${path.relative(process.cwd(), filePath)} — skipping`);
    return false;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes(SEQ_PATCH_MARKER)) {
    console.log("[patch-fca] getSeqID.js already patched.");
    return true;
  }
  if (!content.includes(SEQ_OLD.split("\n")[1])) {
    console.log("[patch-fca] getSeqID.js anchor not found — skipping.");
    return false;
  }
  const patched = content.replace(SEQ_OLD, SEQ_NEW);
  if (patched === content) {
    console.log("[patch-fca] getSeqID.js replace had no effect.");
    return false;
  }
  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[patch-fca] getSeqID.js patched OK (1357004 MQTT bypass).");
  return true;
}

patchGetSeqID(SEQ_ID_FILE);
console.log("[patch-fca] Done.");
