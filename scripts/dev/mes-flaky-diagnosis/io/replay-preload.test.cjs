"use strict";
// Pure installed-Next option parsing plus child Node module loading; no requests.
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const utilsPath = process.argv[2];
assert.ok(utilsPath, "pass the installed next/dist/server/lib/utils.js path");
const utils = require(utilsPath);
const files = ["next-preload.cjs", "replay-receipt.cjs"].map(name => path.join(__dirname, name));
const loader = path.join(__dirname, "replay-preload.cjs");
const probe = `
const targets = JSON.parse(process.argv[1]);
const snapshot = () => targets.map(target => ({ path: target,
  loaded: Object.hasOwn(require.cache, target),
  cache_entries: Object.keys(require.cache).filter(key => key === target).length }));
const before = snapshot();
if (process.argv[2]) require(process.argv[2]);
process.stdout.write(JSON.stringify({ modules: before,
  cache_unchanged_on_require_again: JSON.stringify(before) === JSON.stringify(snapshot()) }));
`;

/**
 * Exercise Next's actual environment rewrite before booting a plain child Node.
 * @param {string} input NODE_OPTIONS before Next's worker rewrite.
 * @param {boolean} repeatLoader Check that a second loader import uses the cache.
 * @returns {object} Parsed options and the child's module-cache evidence.
 */
function inspect(input, repeatLoader) {
  const savedArgs = process.execArgv;
  const savedOptions = process.env.NODE_OPTIONS;
  let formatted;
  let parsed;
  try {
    process.execArgv = [];
    process.env.NODE_OPTIONS = input;
    parsed = utils.getParsedNodeOptions();
    formatted = utils.formatNodeOptions(parsed).nodeOptions;
  } finally {
    process.execArgv = savedArgs;
    if (savedOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = savedOptions;
  }
  const child = spawnSync(process.execPath, ["-e", probe, JSON.stringify(files), ...(repeatLoader ? [loader] : [])], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: formatted,
      IO_NODE_TRACE_FILE: "", IO_REPLAY_RECEIPTS: "" },
  });
  assert.equal(child.status, 0, child.stderr);
  return { input, parsed, formatted, child: JSON.parse(child.stdout) };
}

const original = inspect(files.map(file => `--require=${JSON.stringify(file)}`).join(" "), false);
console.log(JSON.stringify({ case: "original_two_requires", ...original }));
assert.deepEqual(original.child.modules.map(row => row.loaded), [false, true]);
const fixed = inspect(`--require=${JSON.stringify(loader)}`, true);
console.log(JSON.stringify({ case: "single_loader", ...fixed }));
assert.deepEqual(fixed.child.modules.map(row => row.loaded), [true, true]);
assert.deepEqual(fixed.child.modules.map(row => row.cache_entries), [1, 1]);
assert.equal(fixed.child.cache_unchanged_on_require_again, true);
console.log("PASS: actual Next option rewrite preserves both diagnostic modules through one preload");
