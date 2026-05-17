'use strict';
const store = new Map();

function check(key, maxEvents, windowMs) {
  const now = Date.now();
  if (!store.has(key)) store.set(key, { events: [], warned: false });
  const entry = store.get(key);
  entry.events = entry.events.filter(t => now - t < windowMs);
  entry.events.push(now);
  return { exceeded: entry.events.length > maxEvents, warned: entry.warned };
}

function setWarned(key) { if (store.has(key)) store.get(key).warned = true; }
function reset(key) { store.delete(key); }

// Legacy API for old commands
function isLimited(senderID) {
  const res = check(senderID, 10, 8000);
  return res.exceeded;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    entry.events = entry.events.filter(t => now - t < 60000);
    if (entry.events.length === 0) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { check, setWarned, reset, isLimited };
