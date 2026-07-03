const fs = require("fs");
const os = require("os");
const path = require("path");

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function errorToJson(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function buildExitDump({
  reason,
  code,
  signal,
  childPid,
  startTime,
  endTime = new Date(),
  port,
  hostname,
  cwd,
  receivedSignals = [],
  error = null,
}) {
  return {
    timestamp: endTime.toISOString(),
    reason,
    exitCode: code ?? null,
    signal: signal ?? null,
    pid: process.pid,
    childPid: childPid ?? null,
    port,
    hostname,
    cwd,
    uptimeMs: Math.max(0, endTime.getTime() - startTime.getTime()),
    process: {
      pid: process.pid,
      ppid: process.ppid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      argv: process.argv,
    },
    memory: {
      process: process.memoryUsage(),
      system: {
        total: os.totalmem(),
        free: os.freemem(),
        loadavg: os.loadavg(),
      },
    },
    receivedSignals,
    error: errorToJson(error),
  };
}

function createDiagnostics(rootDir) {
  const logsDir = path.join(rootDir, "logs");
  const dumpsDir = path.join(logsDir, "dumps");
  const logPath = path.join(logsDir, "dev-server.log");

  function ensureDirs() {
    fs.mkdirSync(dumpsDir, { recursive: true });
  }

  function log(message, details = null, date = new Date()) {
    ensureDirs();
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    fs.appendFileSync(logPath, `[${date.toISOString()}] ${message}${suffix}\n`, "utf8");
  }

  function writeExitDump(input, date = new Date()) {
    ensureDirs();
    const dump = buildExitDump({ ...input, endTime: input.endTime || date });
    const dumpPath = path.join(dumpsDir, `dev-exit-${timestampForFile(date)}-${process.pid}.json`);
    fs.writeFileSync(dumpPath, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
    log("exit dump written", { path: dumpPath, reason: dump.reason }, date);
    return dumpPath;
  }

  return {
    log,
    writeExitDump,
    paths: {
      logsDir,
      dumpsDir,
      logPath,
    },
  };
}

module.exports = {
  buildExitDump,
  createDiagnostics,
  timestampForFile,
};
