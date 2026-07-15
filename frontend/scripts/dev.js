// Custom dev server wrapper for Next.js
// - Prints a tidy banner with the real LAN IP
// - Suppresses Next's default banner lines
// - Records exit dumps under _attic/runtime/logs/frontend when the dev server stops

const { execFileSync, spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { createDiagnostics, summarizeFrontendCompileError } = require("./dev-diagnostics");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function detectLanIp() {
  const skip = /vEthernet|WSL|VirtualBox|VMware|Loopback|Hyper-V|Bluetooth|Hamachi|Radmin/i;
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue; // APIPA
      if (iface.address.startsWith("25.")) continue; // Hamachi
      candidates.push(iface.address);
    }
  }
  const isPrivate = (ip) =>
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
  return candidates.find(isPrivate) || candidates[0] || null;
}

const port = process.env.PORT || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const lanIp = detectLanIp();
const rootDir = path.resolve(__dirname, "..");
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || "(default)";
const diagnostics = createDiagnostics(rootDir);
const startTime = new Date();
const receivedSignals = [];
const pipeErrors = [];
let dumpWritten = false;
let child = null;
let lastCompileErrorKey = null;

function recordPipeError(streamName, error) {
  const entry = {
    stream: streamName,
    message: error?.message || String(error),
    code: error?.code || null,
    timestamp: new Date().toISOString(),
  };
  pipeErrors.push(entry);
  diagnostics.log("wrapper pipe error", entry);
}

function safeWrite(streamName, stream, value) {
  try {
    stream.write(value);
  } catch (error) {
    recordPipeError(streamName, error);
  }
}

function getProcessDetails(pid) {
  if (!pid) return null;
  if (process.platform !== "win32") {
    return { pid };
  }
  try {
    const script = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}"`,
      "if ($p) { $p | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress }",
    ].join("; ");
    const raw = execFileSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2000,
    }).trim();
    if (!raw) return { pid };
    const parsed = JSON.parse(raw);
    return {
      pid: parsed.ProcessId ?? pid,
      parentPid: parsed.ParentProcessId ?? null,
      commandLine: parsed.CommandLine ?? null,
    };
  } catch (error) {
    return { pid, lookupError: error.message };
  }
}

function getPortOwners(targetPort) {
  if (process.platform !== "win32") return [];
  try {
    const raw = execFileSync("netstat.exe", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2000,
    });
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i))
      .filter(Boolean)
      .filter((match) => match[1] === String(targetPort))
      .map((match) => ({ localPort: Number(match[1]), pid: Number(match[2]) }));
  } catch (error) {
    return [{ lookupError: error.message }];
  }
}

function banner() {
  const out = process.stdout;
  const url = lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`;
  safeWrite("stdout", out, "\n");
  safeWrite("stdout", out, `  ${C.magenta}${C.bold}DEXCOWIN MES${C.reset}  ${C.gray}dev server${C.reset}\n`);
  safeWrite("stdout", out, `  ${C.gray}${"-".repeat(44)}${C.reset}\n`);
  safeWrite("stdout", out, `  ${C.dim}Network ${C.reset}  ${C.green}${url}${C.reset}\n`);
  safeWrite("stdout", out, `  ${C.dim}Root    ${C.reset}  ${C.cyan}${rootDir}${C.reset}\n`);
  safeWrite("stdout", out, `  ${C.dim}Backend ${C.reset}  ${C.cyan}${backendInternalUrl}${C.reset}\n`);
  safeWrite("stdout", out, `  ${C.gray}${"-".repeat(44)}${C.reset}\n\n`);
}

const SUPPRESS_PATTERNS = [
  /^\s*▲?\s*Next\.js\s/,
  /^\s*-\s*Local:\s/,
  /^\s*-\s*Network:\s/,
  /^\s*-\s*Environments:\s/,
];

function shouldSuppress(line) {
  const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
  return SUPPRESS_PATTERNS.some((re) => re.test(stripped));
}

function createLineFilter(stream) {
  let buf = "";
  return (chunk) => {
    const text = chunk.toString();
    if (stream === process.stderr) {
      const summary = summarizeFrontendCompileError(text);
      if (summary) {
        const key = `${summary.file}:${summary.message}`;
        if (key !== lastCompileErrorKey) {
          lastCompileErrorKey = key;
          diagnostics.logFrontendCompileError(summary);
        }
      }
    }
    buf += text;
    const parts = buf.split("\n");
    buf = parts.pop();
    for (const line of parts) {
      if (!shouldSuppress(line)) safeWrite(stream === process.stderr ? "stderr" : "stdout", stream, line + "\n");
    }
  };
}

function writeExitDumpOnce(reason, details = {}) {
  if (dumpWritten) return;
  dumpWritten = true;
  diagnostics.writeExitDump({
    reason,
    code: details.code ?? null,
    signal: details.signal ?? null,
    childPid: child?.pid ?? null,
    startTime,
    endTime: details.endTime || new Date(),
    port,
    hostname,
    cwd: rootDir,
    backendInternalUrl,
    receivedSignals,
    parentProcess: getProcessDetails(process.ppid),
    childProcess: getProcessDetails(child?.pid),
    pipeErrors,
    portOwners: getPortOwners(port),
    error: details.error ?? null,
  });
}

function forwardSignal(signal) {
  const timestamp = new Date().toISOString();
  receivedSignals.push({ signal, timestamp });
  diagnostics.log("wrapper received signal", { signal });
  if (child && !child.killed) child.kill(signal);
}

banner();
diagnostics.log("dev server wrapper started", {
  port,
  hostname,
  cwd: rootDir,
  backendInternalUrl,
  pid: process.pid,
});

const nextCli = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next");

child = spawn(
  process.execPath,
  [nextCli, "dev", "--hostname", hostname, "--port", port, ...process.argv.slice(2)],
  {
    cwd: rootDir,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
  }
);
diagnostics.log("next dev child spawned", { childPid: child.pid });

child.stdout.on("data", createLineFilter(process.stdout));
child.stderr.on("data", createLineFilter(process.stderr));
process.stdout.on("error", (error) => recordPipeError("stdout", error));
process.stderr.on("error", (error) => recordPipeError("stderr", error));
process.stdin.on("close", () => diagnostics.log("wrapper stdin closed"));
process.stdin.on("end", () => diagnostics.log("wrapper stdin ended"));

child.on("error", (error) => {
  diagnostics.log("next dev child error", { message: error.message });
  writeExitDumpOnce("child-error", { error });
  process.exit(1);
});

child.on("exit", (code, signal) => {
  diagnostics.log("next dev child exited", { code, signal });
  writeExitDumpOnce("child-exit", { code, signal });
  process.exit(code ?? (signal ? 1 : 0));
});

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("SIGHUP", () => forwardSignal("SIGHUP"));

process.on("uncaughtException", (error) => {
  diagnostics.log("wrapper uncaught exception", { message: error.message });
  writeExitDumpOnce("uncaught-exception", { error });
  throw error;
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  diagnostics.log("wrapper unhandled rejection", { message: error.message });
  writeExitDumpOnce("unhandled-rejection", { error });
  process.exit(1);
});

process.on("beforeExit", (code) => {
  diagnostics.log("wrapper beforeExit", { code });
});

process.on("exit", (code) => {
  diagnostics.log("wrapper exit", { code });
});
