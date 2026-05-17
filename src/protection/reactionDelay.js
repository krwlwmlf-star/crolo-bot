'use strict';
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let _running = false;

function wrapSetReaction(api) {
  if (api.__reactionDelayWrapped) return;
  api.__reactionDelayWrapped = true;
  const _orig = api.setMessageReaction ? api.setMessageReaction.bind(api) : null;
  if (!_orig) return;
  api.setMessageReaction = async function(reaction, messageID, callback, forceCustom) {
    const cfg = global.config?.reactionDelay || {};
    if (cfg.enable === false) return _orig(reaction, messageID, callback, forceCustom);
    await sleep(randInt(500, 4000));
    return _orig(reaction, messageID, callback, forceCustom);
  };
}

function start(api) { if (_running) return; _running = true; wrapSetReaction(api); }
function stop() { _running = false; }
module.exports = { start, stop };
