"use strict";

// Launched by Playwright in the export; keep Next stdout and stderr separately.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const source = fs.realpathSync(process.env.MES_DIAG_SOURCE);
if (fs.realpathSync(process.cwd()) !== path.join(source, "frontend") || fs.existsSync(path.join(source, ".git"))) {
  throw new Error("Next diagnostic source ownership mismatch");
}
const output = process.env.MES_DIAG_OUTPUT;
const stdout = fs.openSync(path.join(output, "frontend-stdout.log"), "a");
const stderr = fs.openSync(path.join(output, "frontend-stderr.log"), "a");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100"], {
  cwd: process.cwd(), env: process.env, stdio: ["ignore", stdout, stderr],
});
fs.closeSync(stdout);
fs.closeSync(stderr);
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { child.kill(signal); });
child.on("error", error => { console.error("Next spawn failed", error.code); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  fs.writeFileSync(path.join(output, "frontend-exit.json"), JSON.stringify({ pid: child.pid, code, signal, wall_ms: Date.now() }));
  process.exitCode = code === null ? (signal === "SIGTERM" ? 0 : 1) : code;
});
