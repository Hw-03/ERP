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

function stripAnsi(value) {
  return String(value || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function basenameFromLogPath(value) {
  if (!value) return null;
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || null;
}

function summarizeFrontendCompileError(text) {
  const clean = stripAnsi(text);
  if (!/(Failed to compile|Syntax Error|Compile Error|Module parse failed|Unexpected token)/i.test(clean)) {
    return null;
  }

  const fileMatch = clean.match(/(?:\.\/|[A-Za-z]:[\\/])?[\w./\\-]+\.(?:tsx|ts|jsx|js)/);
  const messageMatch =
    clean.match(/(Syntax Error:[^\r\n]+)/i) ||
    clean.match(/(Module parse failed[^\r\n]*)/i) ||
    clean.match(/(Unexpected token[^\r\n]*)/i) ||
    clean.match(/(Failed to compile[^\r\n.]*)/i);

  return {
    file: basenameFromLogPath(fileMatch?.[0]) || "-",
    message: (messageMatch?.[1] || "Frontend compile error").trim(),
  };
}

function quoteLogValue(value) {
  return String(value || "-").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function classifyExitReason({
  reason,
  code,
  signal,
  receivedSignals = [],
  pipeErrors = [],
}) {
  if (pipeErrors.length > 0) return "output-pipe-broken";
  if (signal) return `signal-${signal}`;
  if (receivedSignals.length > 0) return `forwarded-${receivedSignals[receivedSignals.length - 1].signal}`;
  if (reason === "child-exit" && code === 0) return "child-exit-zero-unexpected";
  return reason;
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
  runMode = "dev",
  nextCommand = "dev",
  receivedSignals = [],
  parentProcess = null,
  childProcess = null,
  pipeErrors = [],
  portOwners = [],
  error = null,
}) {
  const classification = classifyExitReason({ reason, code, signal, receivedSignals, pipeErrors });
  return {
    timestamp: endTime.toISOString(),
    reason,
    classification,
    exitCode: code ?? null,
    signal: signal ?? null,
    pid: process.pid,
    childPid: childPid ?? null,
    port,
    hostname,
    cwd,
    runMode,
    nextCommand,
    uptimeMs: Math.max(0, endTime.getTime() - startTime.getTime()),
    process: {
      pid: process.pid,
      ppid: process.ppid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      argv: process.argv,
    },
    parentProcess,
    childProcess,
    pipeErrors,
    portOwners,
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

function resolvedRuntimeRoot(rootDir) {
  const repoRoot = path.resolve(rootDir, "..");
  const configuredRoot = process.env.MES_RUNTIME_ROOT;
  return path.resolve(
    configuredRoot
      ? path.isAbsolute(configuredRoot)
        ? configuredRoot
        : path.join(repoRoot, configuredRoot)
      : path.join(repoRoot, "_attic", "runtime"),
  );
}

function physicalPath(candidate) {
  const missingParts = [];
  let existing = path.resolve(candidate);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missingParts.unshift(path.basename(existing));
    existing = parent;
  }
  const realExisting = fs.realpathSync.native(existing);
  return path.resolve(realExisting, ...missingParts);
}

function assertRuntimePath(runtimeRoot, candidate) {
  const physicalRoot = physicalPath(runtimeRoot);
  const physicalCandidate = physicalPath(candidate);
  const relative = path.relative(physicalRoot, physicalCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`runtime path is outside MES_RUNTIME_ROOT: ${candidate}`);
  }
}

function runtimePath(rootDir, ...parts) {
  const runtimeRoot = resolvedRuntimeRoot(rootDir);
  const candidate = path.resolve(runtimeRoot, ...parts);
  const relative = path.relative(runtimeRoot, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`runtime path is outside MES_RUNTIME_ROOT: ${candidate}`);
  }
  assertRuntimePath(runtimeRoot, candidate);
  return candidate;
}

function writeRuntimeFile(runtimeRoot, candidate, content, { append = false } = {}) {
  assertRuntimePath(runtimeRoot, candidate);
  const physicalCandidate = physicalPath(candidate);
  assertRuntimePath(runtimeRoot, physicalCandidate);

  let fd;
  try {
    fd = fs.openSync(physicalCandidate, append ? "a" : "wx");
    const openedFile = fs.fstatSync(fd, { bigint: true });
    assertRuntimePath(runtimeRoot, candidate);
    const currentFile = fs.statSync(physicalCandidate, { bigint: true });
    if (openedFile.dev !== currentFile.dev || openedFile.ino !== currentFile.ino) {
      throw new Error(`runtime path changed while opening file: ${candidate}`);
    }
    if (append) {
      fs.appendFileSync(fd, content, "utf8");
    } else {
      fs.writeFileSync(fd, content, "utf8");
    }
    assertRuntimePath(runtimeRoot, candidate);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function prepareNodeReportDirectory(rootDir, { maxReports = 3, reserveSlots = 1 } = {}) {
  if (!Number.isInteger(maxReports) || maxReports < 1) {
    throw new Error("maxReports must be a positive integer");
  }
  if (!Number.isInteger(reserveSlots) || reserveSlots < 0 || reserveSlots >= maxReports) {
    throw new Error("reserveSlots must be a non-negative integer below maxReports");
  }

  const runtimeRoot = resolvedRuntimeRoot(rootDir);
  const reportsDir = runtimePath(rootDir, "logs", "frontend", "node-reports");
  assertRuntimePath(runtimeRoot, reportsDir);
  fs.mkdirSync(reportsDir, { recursive: true });
  assertRuntimePath(runtimeRoot, reportsDir);

  const reports = fs.readdirSync(reportsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^report\..+\.json$/i.test(entry.name))
    .map((entry) => {
      const reportPath = path.join(reportsDir, entry.name);
      assertRuntimePath(runtimeRoot, reportPath);
      return { path: reportPath, name: entry.name, mtimeMs: fs.statSync(reportPath).mtimeMs };
    })
    .sort((left, right) => right.name.localeCompare(left.name) || right.mtimeMs - left.mtimeMs);

  for (const report of reports.slice(maxReports - reserveSlots)) {
    assertRuntimePath(runtimeRoot, report.path);
    fs.unlinkSync(report.path);
  }

  return reportsDir;
}

function createDiagnostics(rootDir) {
  const runtimeRoot = resolvedRuntimeRoot(rootDir);
  const logsDir = runtimePath(rootDir, "logs", "frontend");
  const dumpsDir = path.join(logsDir, "dumps");
  const logPath = path.join(logsDir, "dev-server.log");

  function prepareNodeReportDirectoryForRuntime(options) {
    return prepareNodeReportDirectory(rootDir, options);
  }

  function ensureDirs() {
    assertRuntimePath(runtimeRoot, dumpsDir);
    fs.mkdirSync(dumpsDir, { recursive: true });
    assertRuntimePath(runtimeRoot, dumpsDir);
    assertRuntimePath(runtimeRoot, logPath);
  }

  function log(message, details = null, date = new Date()) {
    ensureDirs();
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    writeRuntimeFile(
      runtimeRoot,
      logPath,
      `[${date.toISOString()}] ${message}${suffix}\n`,
      { append: true },
    );
  }

  function logFrontendCompileError(summary, date = new Date()) {
    if (!summary) return;
    ensureDirs();
    writeRuntimeFile(
      runtimeRoot,
      logPath,
      `[${date.toISOString()}] FRONTEND_COMPILE_ERROR file=${quoteLogValue(summary.file)} message="${quoteLogValue(summary.message)}"\n`,
      { append: true },
    );
  }

  function writeExitDump(input, date = new Date()) {
    ensureDirs();
    const dump = buildExitDump({ ...input, endTime: input.endTime || date });
    const dumpPath = path.join(dumpsDir, `dev-exit-${timestampForFile(date)}-${process.pid}.json`);
    writeRuntimeFile(runtimeRoot, dumpPath, `${JSON.stringify(dump, null, 2)}\n`);
    log("exit dump written", { path: dumpPath, reason: dump.reason }, date);
    return dumpPath;
  }

  return {
    log,
    logFrontendCompileError,
    prepareNodeReportDirectory: prepareNodeReportDirectoryForRuntime,
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
  classifyExitReason,
  createDiagnostics,
  prepareNodeReportDirectory,
  summarizeFrontendCompileError,
  timestampForFile,
};
