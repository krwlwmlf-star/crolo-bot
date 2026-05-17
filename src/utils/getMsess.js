"use strict";

/**
 * getMsess.js — Tries to obtain m_sess cookie by visiting Facebook Messenger endpoints
 * m_sess is required for real-time listen/listenMqtt and GraphQL batch APIs
 */

const https = require("https");

const ENDPOINTS = [
  { host: "www.facebook.com",  path: "/messages/"   },
  { host: "www.messenger.com", path: "/"            },
  { host: "m.facebook.com",    path: "/messages/"   },
  { host: "m.facebook.com",    path: "/messages/t/" },
];

function cookiesToStr(arr) {
  return arr.map(c => `${c.key || c.name}=${c.value}`).join("; ");
}

function parseCookieHeader(str, defaultDomain) {
  const FAR  = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const NOW  = new Date().toISOString();
  const parts = str.split(";");
  const nameVal = parts[0].trim();
  const eq = nameVal.indexOf("=");
  if (eq < 1) return null;
  const key   = nameVal.slice(0, eq).trim();
  const value = nameVal.slice(eq + 1).trim();
  if (!key || !value) return null;

  let domain = defaultDomain;
  const domPart = parts.find(p => p.trim().toLowerCase().startsWith("domain="));
  if (domPart) domain = domPart.split("=")[1].trim().replace(/^\./, "");

  return {
    key, value, domain: domain || "facebook.com", path: "/",
    hostOnly: false, creation: NOW, lastAccessed: NOW, expires: FAR,
  };
}

function fetchEndpoint(host, path, cookieStr, userAgent) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host, path, method: "GET",
      headers: {
        "Cookie": cookieStr,
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Referer": "https://www.facebook.com/",
        "Connection": "keep-alive",
      },
    }, (res) => {
      const rawCookies = res.headers["set-cookie"] || [];
      const parsed     = rawCookies.map(sc => parseCookieHeader(sc, host)).filter(Boolean);
      const hasMsess   = parsed.some(c => c.key === "m_sess");
      res.on("data", () => {});
      res.on("end", () => resolve({ cookies: parsed, hasMsess, status: res.statusCode }));
    });
    req.on("error", () => resolve({ cookies: [], hasMsess: false, status: 0 }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ cookies: [], hasMsess: false, status: 0 }); });
    req.end();
  });
}

/**
 * Try to get m_sess cookie from Facebook/Messenger endpoints
 * @param {Array} appState  current cookie array
 * @param {string} userAgent
 * @returns {Promise<Array>} new cookies (may include m_sess), empty if none found
 */
async function getMsess(appState, userAgent) {
  const UA = userAgent ||
    "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

  const cookieStr = cookiesToStr(appState);

  for (const ep of ENDPOINTS) {
    try {
      const result = await fetchEndpoint(ep.host, ep.path, cookieStr, UA);
      if (result.cookies.length) {
        global.log?.info?.("MSESS", `${ep.host}${ep.path} → ${result.cookies.length} cookies, m_sess: ${result.hasMsess}`);
      }
      if (result.hasMsess) {
        return result.cookies;
      }
    } catch (_) {}
  }

  return [];
}

module.exports = getMsess;
