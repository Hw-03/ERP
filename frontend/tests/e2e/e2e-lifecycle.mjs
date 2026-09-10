import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function fileSnapshot(filePath) {
  if (!fs.existsSync(filePath)) return { path: filePath, exists: false, sha256: null };
  return {
    path: filePath,
    exists: true,
    sha256: createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
  };
}

const OWNERSHIP_FILE_NAME = "owner.json";
const TERMINAL_RUN_PHASES = new Set(["cleanup-complete", "safe-abort"]);

function windowsExclusiveBindProbePath(cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, "scripts", "dev", "e2e-exclusive-bind-probe.ps1"),
    path.join(cwd, "..", "scripts", "dev", "e2e-exclusive-bind-probe.ps1"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function ownershipFile(lockDir) {
  return path.join(lockDir, OWNERSHIP_FILE_NAME);
}

function requireRunToken(runToken) {
  if (typeof runToken !== "string" || runToken.length < 4) {
    throw new Error("E2E runner ownership is required");
  }
}

export function approvedE2eFrontendPort(value, fallback = 3100) {
  const configured = value === undefined ? fallback : Number(value);
  if (
    !Number.isInteger(configured)
    || (configured !== 3100 && (configured < 3300 || configured > 3399))
  ) {
    throw new Error(
      `E2E_FRONTEND_PORT must be an approved E2E frontend port `
      + `(3100 or 3300-3399; received: ${value ?? fallback})`,
    );
  }
  return configured;
}

export function approvedE2eBackendPort(value, fallback = 8021) {
  const configured = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(configured) || ![8021, 8022].includes(configured)) {
    throw new Error(
      `E2E_BACKEND_PORT must be an approved E2E backend port `
      + `(8021 or 8022; received: ${value ?? fallback})`,
    );
  }
  return configured;
}

export function acquireE2eRunOwnership({
  lockDir,
  runToken,
  runnerPid = process.pid,
  fsImpl = fs,
}) {
  requireRunToken(runToken);
  try {
    fsImpl.mkdirSync(lockDir);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("An E2E run is already active; refusing to reclaim its lock");
    }
    throw error;
  }

  const owner = {
    version: 1,
    runToken,
    runnerPid,
    phase: "acquired",
  };
  try {
    fsImpl.writeFileSync(ownershipFile(lockDir), JSON.stringify(owner, null, 2), {
      encoding: "utf-8",
      flag: "wx",
    });
  } catch (error) {
    try {
      fsImpl.rmdirSync(lockDir);
    } catch {
      // The just-created lock could not be proven empty; preserve it as evidence.
    }
    throw error;
  }
  return owner;
}

export function assertE2eRunOwnership({ lockDir, runToken, fsImpl = fs }) {
  requireRunToken(runToken);
  let owner;
  try {
    owner = JSON.parse(fsImpl.readFileSync(ownershipFile(lockDir), "utf-8"));
  } catch {
    throw new Error("E2E runner ownership is required and no valid lock evidence exists");
  }
  if (owner?.runToken !== runToken) {
    throw new Error("E2E run ownership mismatch; refusing foreign-run mutation");
  }
  return owner;
}

export function markE2eRunPhase({ lockDir, runToken, phase, fsImpl = fs }) {
  const owner = assertE2eRunOwnership({ lockDir, runToken, fsImpl });
  const nextOwner = { ...owner, phase };
  fsImpl.writeFileSync(
    ownershipFile(lockDir),
    JSON.stringify(nextOwner, null, 2),
    { encoding: "utf-8" },
  );
  return nextOwner;
}

export function releaseE2eRunOwnership({ lockDir, runToken, fsImpl = fs }) {
  const owner = assertE2eRunOwnership({ lockDir, runToken, fsImpl });
  if (!TERMINAL_RUN_PHASES.has(owner.phase)) {
    throw new Error("E2E terminal cleanup evidence is required before releasing the run lock");
  }
  fsImpl.rmSync(ownershipFile(lockDir));
  fsImpl.rmdirSync(lockDir);
}

export function canonicalE2eBaseUrl(configuredUrl, frontendPort) {
  const expected = `http://127.0.0.1:${frontendPort}`;
  if (configuredUrl !== undefined && configuredUrl !== expected) {
    throw new Error(`E2E_BASE_URL must match the dedicated loopback URL ${expected}`);
  }
  return expected;
}

export function dedicatedE2eWebServerEnv(backendPort) {
  return {
    BACKEND_INTERNAL_URL: `http://127.0.0.1:${backendPort}`,
    NEXT_PUBLIC_API_URL: "",
  };
}

function probeLoopbackConnection(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.unref();
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(true));
  });
}

function probeNodeExclusiveLoopbackBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      resolve(available);
    };
    server.unref();
    server.once("error", () => finish(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close((error) => finish(!error));
    });
  });
}

export function probeExclusiveLoopbackBind(
  port,
  {
    platform = process.platform,
    run = spawnSync,
    probeScript = windowsExclusiveBindProbePath(),
  } = {},
) {
  if (platform !== "win32") return probeNodeExclusiveLoopbackBind(port);
  const result = run(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      probeScript,
      "-Port",
      String(port),
    ],
    { encoding: "utf-8", windowsHide: true },
  );
  return result.status === 0 && String(result.stdout ?? "").trim() === "AVAILABLE";
}

export async function probeLoopbackPort(
  port,
  {
    connectProbe = probeLoopbackConnection,
    bindProbe = probeExclusiveLoopbackBind,
  } = {},
) {
  if (await connectProbe(port)) return false;
  return bindProbe(port);
}

export async function ensureDedicatedPortAvailable(
  port,
  probe = probeLoopbackPort,
  service = "backend",
) {
  if (!await probe(port)) {
    throw new Error(`E2E dedicated ${service} port ${port} is already in use`);
  }
}

export async function prepareOwnedBackendPreflight({
  backendPort,
  markSafeAbort,
  ensurePortAvailable = ensureDedicatedPortAvailable,
  resolvePython = resolvePythonExecutable,
}) {
  try {
    await ensurePortAvailable(backendPort);
    return resolvePython();
  } catch (error) {
    markSafeAbort();
    throw error;
  }
}

export async function selectDedicatedBackendPort(value, probe = probeLoopbackPort) {
  if (value !== undefined) {
    const configured = approvedE2eBackendPort(value);
    await ensureDedicatedPortAvailable(configured, probe);
    return configured;
  }

  for (const candidate of [8021, 8022]) {
    if (await probe(candidate)) return candidate;
  }
  throw new Error("E2E backend ports unavailable: 8021 and fallback 8022");
}

function backendReadinessTimeoutError(backendUrl, timeoutMs) {
  const error = new Error(
    `E2E dedicated backend (${backendUrl}) was not ready within ${timeoutMs}ms`,
  );
  error.code = "E2E_BACKEND_READINESS_TIMEOUT";
  return error;
}

async function runWithinBackendReadinessDeadline({
  deadline,
  backendUrl,
  timeoutMs,
  operation,
}) {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw backendReadinessTimeoutError(backendUrl, timeoutMs);

  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(backendReadinessTimeoutError(backendUrl, timeoutMs));
        }, remainingMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForOwnedBackendReady({
  backendUrl,
  expectedNonce,
  expectedPid,
  timeoutMs,
  getExitCode,
  fetchImpl = fetch,
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}) {
  if (!Number.isInteger(expectedPid) || expectedPid <= 0) {
    throw new Error("E2E spawned backend PID is required for readiness");
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exitCode = getExitCode();
    if (exitCode !== null) {
      throw new Error(`E2E spawned backend exited before readiness (code ${exitCode})`);
    }
    try {
      const identity = await runWithinBackendReadinessDeadline({
        deadline,
        backendUrl,
        timeoutMs,
        operation: async (signal) => {
          const identityResponse = await fetchImpl(
            `${backendUrl}/__e2e__/identity`,
            { signal },
          );
          if (!identityResponse.ok) {
            throw new Error(
              `E2E spawned backend identity endpoint is missing `
              + `(status ${identityResponse.status})`,
            );
          }
          try {
            return await identityResponse.json();
          } catch (error) {
            if (error?.name === "AbortError") throw error;
            throw new Error("E2E spawned backend identity response is invalid");
          }
        },
      });
      if (identity?.nonce !== expectedNonce) {
        throw new Error("E2E spawned backend identity nonce does not match this run");
      }
      if (identity?.pid !== expectedPid) {
        throw new Error("E2E spawned backend identity PID does not match its process receipt");
      }
      if (getExitCode() !== null) {
        throw new Error(`E2E spawned backend exited before readiness (code ${getExitCode()})`);
      }
      const healthResponse = await runWithinBackendReadinessDeadline({
        deadline,
        backendUrl,
        timeoutMs,
        operation: (signal) => fetchImpl(`${backendUrl}/health/ready`, { signal }),
      });
      if (healthResponse.ok) {
        const finalExitCode = getExitCode();
        if (finalExitCode !== null) {
          throw new Error(`E2E spawned backend exited before readiness (code ${finalExitCode})`);
        }
        return;
      }
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message.includes("spawned backend exited")
          || error.message.includes("spawned backend identity")
          || error.code === "E2E_BACKEND_READINESS_TIMEOUT"
        )
      ) {
        throw error;
      }
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(500, remainingMs));
  }
  throw backendReadinessTimeoutError(backendUrl, timeoutMs);
}

export async function stopOwnedProcess(
  receipt,
  {
    readStartToken,
    killProcess,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  },
) {
  const currentStartToken = await readStartToken(receipt.pid);
  if (currentStartToken === null) return "already-exited";
  if (currentStartToken !== receipt.startToken) {
    throw new Error(
      `E2E process ownership mismatch for PID ${receipt.pid}; refusing to terminate a reused process`,
    );
  }
  try {
    await killProcess(receipt.pid);
  } catch (error) {
    if (await readStartToken(receipt.pid) === null) return "stopped";
    throw error;
  }
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const remainingStartToken = await readStartToken(receipt.pid);
    if (remainingStartToken === null) return "stopped";
    if (remainingStartToken !== receipt.startToken) {
      throw new Error(
        `E2E process ownership changed for PID ${receipt.pid}; refusing cleanup`,
      );
    }
    await sleep(50);
  }
  throw new Error(`E2E owned backend PID ${receipt.pid} did not terminate`);
}

export async function cleanupOwnedE2eRun({
  receipt,
  readStartToken,
  killProcess,
  removeDedicatedDb,
  assertProtectedDbUnchanged,
  removeArtifacts,
  sleep = undefined,
}) {
  await stopOwnedProcess(receipt, { readStartToken, killProcess, sleep });
  await assertProtectedDbUnchanged();
  await removeDedicatedDb();
  await removeArtifacts();
}

export async function cleanupCapturedOwnedE2eRun({
  expectedRunToken,
  capturedReceipt,
  persistedReceipt,
  readStartToken,
  killProcess,
  removeDedicatedDb,
  assertProtectedDbUnchanged,
  removeArtifacts,
  sleep = undefined,
}) {
  if (
    capturedReceipt?.runNonce !== expectedRunToken
    || persistedReceipt?.runNonce !== expectedRunToken
  ) {
    throw new Error("E2E captured teardown run nonce mismatch; refusing foreign-run cleanup");
  }
  if (
    persistedReceipt.pid !== capturedReceipt.pid
    || persistedReceipt.startToken !== capturedReceipt.startToken
  ) {
    throw new Error("E2E captured teardown receipt identity mismatch");
  }
  await cleanupOwnedE2eRun({
    receipt: capturedReceipt,
    readStartToken,
    killProcess,
    removeDedicatedDb,
    assertProtectedDbUnchanged,
    removeArtifacts,
    sleep,
  });
}

export function snapshotFileFamily(basePath) {
  return ["", "-wal", "-shm"].map((suffix) => fileSnapshot(`${basePath}${suffix}`));
}

export function assertFileFamilyUnchanged(before, after) {
  if (before.length !== after.length) {
    throw new Error("E2E protected DB family shape changed");
  }
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index];
    const current = after[index];
    if (
      previous.path !== current.path
      || previous.exists !== current.exists
      || previous.sha256 !== current.sha256
    ) {
      throw new Error(`${previous.path} changed during E2E`);
    }
  }
}

export function readProcessStartToken(
  pid,
  { platform = process.platform, run = spawnSync, fsImpl = fs } = {},
) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid E2E backend PID: ${pid}`);

  if (platform === "win32") {
    const script = [
      `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
      "if ($null -eq $process) { exit 3 }",
      "[Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks.ToString())",
    ].join("; ");
    const result = run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf-8", windowsHide: true },
    );
    if (result.status === 3) return null;
    if (result.status !== 0 || !String(result.stdout ?? "").trim()) {
      throw new Error(`Unable to read start time for E2E backend PID ${pid}`);
    }
    return `win32:${String(result.stdout).trim()}`;
  }

  const procStat = `/proc/${pid}/stat`;
  if (platform === "linux") {
    if (!fsImpl.existsSync(procStat)) return null;
    const stat = fsImpl.readFileSync(procStat, "utf-8");
    const fieldsAfterCommand = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    const startTicks = fieldsAfterCommand[19];
    if (!startTicks) throw new Error(`Unable to parse start time for E2E backend PID ${pid}`);
    return `linux:${startTicks}`;
  }

  const result = run("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf-8" });
  if (result.status !== 0) return null;
  const startTime = String(result.stdout ?? "").trim();
  if (!startTime) return null;
  return `${platform}:${startTime}`;
}

export function resolvePythonExecutable(run = spawnSync, pathExists = fs.existsSync) {
  const result = run(
    "python",
    ["-c", "import sys; print(sys.executable)"],
    { encoding: "utf-8", windowsHide: true },
  );
  const executable = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !path.isAbsolute(executable) || !pathExists(executable)) {
    throw new Error(
      `Unable to resolve an absolute Python executable behind the launcher: `
      + `${String(result.stderr ?? "").trim() || executable || `exit ${result.status}`}`,
    );
  }
  return executable;
}
