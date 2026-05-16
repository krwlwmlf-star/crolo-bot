/**
 * Crolo Bot — Logger
 */
"use strict";

const chalk = require("chalk");

const ts = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;
};

const logger = {
  info:  (tag, msg) => console.log(`${chalk.gray(ts())} ${chalk.cyan(`[${tag}]`)} ${msg}`),
  warn:  (tag, msg) => console.log(`${chalk.gray(ts())} ${chalk.yellow(`[${tag}]`)} ${msg}`),
  error: (tag, msg) => console.error(`${chalk.gray(ts())} ${chalk.red(`[${tag}]`)} ${msg}`),
  success:(tag, msg) => console.log(`${chalk.gray(ts())} ${chalk.green(`[${tag}]`)} ${msg}`),
  debug: (tag, msg) => { if (process.env.DEBUG) console.log(`${chalk.gray(ts())} ${chalk.magenta(`[${tag}]`)} ${msg}`); },
};

module.exports = logger;
