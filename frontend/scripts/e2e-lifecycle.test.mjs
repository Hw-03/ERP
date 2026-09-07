import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  acquireE2eRunOwnership,
  approvedE2eBackendPort,
  approvedE2eFrontendPort,
  assertFileFamilyUnchanged,
  assertE2eRunOwnership,
  canonicalE2eBaseUrl,
  cleanupCapturedOwnedE2eRun,
  cleanupOwnedE2eRun,
  dedicatedE2eWebServerEnv,
  ensureDedicatedPortAvailable,
  markE2eRunPhase,
  prepareOwnedBackendPreflight,
  probeExclusiveLoopbackBind,
  probeLoopbackPort,
  readProcessStartToken,
  releaseE2eRunOwnership,
  resolvePythonExecutable,
  selectDedicatedBackendPort,
  snapshotFileFamily,
  stopOwnedProcess,
  waitForOwnedBackendReady,
} from "../tests/e2e/e2e-lifecycle.mjs";

test("frontend port allowlist accepts only 3100 or 3300 through 3399", () => {
  assert.equal(approvedE2eFrontendPort(undefined), 3100);
  assert.equal(approvedE2eFrontendPort("3100"), 3100);
  assert.equal(approvedE2eFrontendPort("3300"), 3300);
  assert.equal(approvedE2eFrontendPort("3399"), 3399);
  for (const rejected of ["1", "3000", "3299", "3400", "8010", "8011", "not-a-port"]) {
    assert.throws(() => approvedE2eFrontendPort(rejected), /approved E2E frontend port/);
  }
});

test("backend port allowlist accepts only the dedicated default and fallback", () => {
  assert.equal(approvedE2eBackendPort(undefined), 8021);
  assert.equal(approvedE2eBackendPort("8021"), 8021);
  assert.equal(approvedE2eBackendPort("8022"), 8022);
  for (const rejected of ["1", "8010", "8011", "8020", "8023", "not-a-port"]) {
    assert.throws(() => approvedE2eBackendPort(rejected), /approved E2E backend port/);
  }
});

test("backend port selection falls back to 8022 and rejects when both are occupied", async () => {
  const fallbackProbes = [];
  assert.equal(
    await selectDedicatedBackendPort(undefined, async (port) => {
      fallbackProbes.push(port);
      return port === 8022;
    }),
    8022,
  );
  assert.deepEqual(fallbackProbes, [8021, 8022]);

  await assert.rejects(
    selectDedicatedBackendPort(undefined, async () => false),
    /backend ports unavailable: 8021 and fallback 8022/,
  );
  await assert.rejects(
    selectDedicatedBackendPort("8011", async () => true),
    /approved E2E backend port/,
  );
});

test("loopback probe treats a connectable listener as occupied before attempting bind", async () => {
  const calls = [];
  const available = await probeLoopbackPort(8021, {
    connectProbe: async (port) => {
      calls.push(`connect:${port}`);
      return true;
    },
    bindProbe: async (port) => {
      calls.push(`bind:${port}`);
      return true;
    },
  });

  assert.equal(available, false);
  assert.deepEqual(calls, ["connect:8021"]);
});

test(
  "Windows native exclusive bind rejects an isolated listener and releases its ephemeral port",
  { skip: process.platform !== "win32" },
  async () => {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port: 0 }, resolve);
    });
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const port = address.port;
    try {
      assert.equal(await probeExclusiveLoopbackBind(port), false);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    assert.equal(await probeExclusiveLoopbackBind(port), true);
  },
);

test("Python ownership resolves the real interpreter behind a launcher", () => {
  const calls = [];
  const expectedExecutable = process.execPath;
  const executable = resolvePythonExecutable((command, args, options) => {
    calls.push({ command, args, options });
    return {
      status: 0,
      stdout: `${expectedExecutable}\n`,
      stderr: "",
    };
  });

  assert.equal(executable, expectedExecutable);
  assert.deepEqual(calls[0].args, ["-c", "import sys; print(sys.executable)"]);
  assert.equal(calls[0].options.windowsHide, true);
  assert.throws(
    () => resolvePythonExecutable(() => ({ status: 0, stdout: "python", stderr: "" })),
    /absolute Python executable/,
  );
  assert.throws(
    () => resolvePythonExecutable(
      () => ({ status: 0, stdout: `${expectedExecutable}\n`, stderr: "" }),
      () => false,
    ),
    /absolute Python executable/,
  );
});

test("backend preflight marks safe abort when Python resolution fails before mutation", async () => {
  const calls = [];
  await assert.rejects(
    prepareOwnedBackendPreflight({
      backendPort: 8022,
      ensurePortAvailable: async (port) => calls.push(`port:${port}`),
      resolvePython: () => {
        calls.push("resolve-python");
        throw new Error("missing Python");
      },
      markSafeAbort: () => calls.push("safe-abort"),
    }),
    /missing Python/,
  );
  assert.deepEqual(calls, ["port:8022", "resolve-python", "safe-abort"]);
});

test("run ownership is atomic, token-bound, terminal-only, and never reclaims stale locks", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-lock-"));
  const lockDir = path.join(tempRoot, ".e2e-run-lock");
  try {
    acquireE2eRunOwnership({ lockDir, runToken: "run-a", runnerPid: 101 });
    assert.equal(assertE2eRunOwnership({ lockDir, runToken: "run-a" }).phase, "acquired");
    assert.throws(
      () => acquireE2eRunOwnership({ lockDir, runToken: "run-b", runnerPid: 202 }),
      /already active/,
    );
    assert.throws(
      () => assertE2eRunOwnership({ lockDir, runToken: "run-b" }),
      /ownership mismatch/,
    );
    assert.throws(
      () => releaseE2eRunOwnership({ lockDir, runToken: "run-a" }),
      /terminal cleanup evidence/,
    );
    markE2eRunPhase({ lockDir, runToken: "run-a", phase: "cleanup-complete" });
    releaseE2eRunOwnership({ lockDir, runToken: "run-a" });
    assert.equal(fs.existsSync(lockDir), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("E2E base URL is always the selected loopback frontend", () => {
  assert.equal(canonicalE2eBaseUrl(undefined, 3100), "http://127.0.0.1:3100");
  assert.equal(
    canonicalE2eBaseUrl("http://127.0.0.1:3301", 3301),
    "http://127.0.0.1:3301",
  );
  assert.throws(
    () => canonicalE2eBaseUrl("http://127.0.0.1:3000", 3100),
    /must match the dedicated loopback URL/,
  );
  assert.throws(
    () => canonicalE2eBaseUrl("https://example.invalid", 3100),
    /must match the dedicated loopback URL/,
  );
});

test("E2E web server cannot inherit an external public API URL", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://external-sentinel.invalid";
  try {
    const parentValue = process.env.NEXT_PUBLIC_API_URL;
    const childEnv = dedicatedE2eWebServerEnv(8021);

    assert.deepEqual(childEnv, {
      BACKEND_INTERNAL_URL: "http://127.0.0.1:8021",
      NEXT_PUBLIC_API_URL: "",
    });
    assert.equal(process.env.NEXT_PUBLIC_API_URL, parentValue);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  }
  assert.equal(process.env.NEXT_PUBLIC_API_URL, previous);
});

test("dedicated backend port fails closed before startup when unavailable", async () => {
  let probes = 0;
  await assert.rejects(
    ensureDedicatedPortAvailable(8021, async () => {
      probes += 1;
      return false;
    }),
    /dedicated backend port 8021 is already in use/,
  );
  assert.equal(probes, 1);
});

test("backend readiness rejects an exited spawned child before trusting health", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    waitForOwnedBackendReady({
      backendUrl: "http://127.0.0.1:8021",
      expectedPid: 4242,
      timeoutMs: 1_000,
      getExitCode: () => 1,
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: true };
      },
      sleep: async () => {},
    }),
    /spawned backend exited before readiness \(code 1\)/,
  );
  assert.equal(fetchCalls, 0);
});

test("backend readiness rejects a healthy foreign server without the run identity", async () => {
  let healthCalls = 0;
  await assert.rejects(
    waitForOwnedBackendReady({
      backendUrl: "http://127.0.0.1:8021",
      expectedNonce: "run-expected",
      expectedPid: 4242,
      timeoutMs: 1_000,
      getExitCode: () => null,
      fetchImpl: async (url) => {
        if (url.endsWith("/__e2e__/identity")) return { ok: false, status: 404 };
        healthCalls += 1;
        return { ok: true };
      },
      sleep: async () => {},
    }),
    /identity endpoint is missing/,
  );
  assert.equal(healthCalls, 0);
});

test("backend readiness accepts health only after the spawned run nonce matches", async () => {
  const urls = [];
  await waitForOwnedBackendReady({
    backendUrl: "http://127.0.0.1:8021",
    expectedNonce: "run-expected",
    expectedPid: 4242,
    timeoutMs: 1_000,
    getExitCode: () => null,
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.endsWith("/__e2e__/identity")) {
        return { ok: true, json: async () => ({ nonce: "run-expected", pid: 4242 }) };
      }
      return { ok: true };
    },
    sleep: async () => {},
  });
  assert.deepEqual(urls, [
    "http://127.0.0.1:8021/__e2e__/identity",
    "http://127.0.0.1:8021/health/ready",
  ]);
});

test("backend readiness rejects a matching nonce served by a different process", async () => {
  let healthCalls = 0;
  await assert.rejects(
    waitForOwnedBackendReady({
      backendUrl: "http://127.0.0.1:8022",
      expectedNonce: "run-expected",
      expectedPid: 4242,
      timeoutMs: 1_000,
      getExitCode: () => null,
      fetchImpl: async (url) => {
        if (url.endsWith("/__e2e__/identity")) {
          return { ok: true, json: async () => ({ nonce: "run-expected", pid: 4343 }) };
        }
        healthCalls += 1;
        return { ok: true };
      },
      sleep: async () => {},
    }),
    /identity PID does not match/,
  );
  assert.equal(healthCalls, 0);
});

for (const stalledStep of ["identity-fetch", "identity-json", "health-fetch"]) {
  test(`backend readiness deadline aborts a stalled ${stalledStep}`, async () => {
    let aborted = false;
    const stalledResponse = (signal) => new Promise(() => {
      signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
    });
    const fetchImpl = async (url, options) => {
      if (stalledStep === "identity-fetch") return stalledResponse(options?.signal);
      if (url.endsWith("/__e2e__/identity")) {
        return {
          ok: true,
          json: stalledStep === "identity-json"
            ? () => stalledResponse(options?.signal)
            : async () => ({ nonce: "run-expected", pid: 4242 }),
        };
      }
      return stalledResponse(options?.signal);
    };
    const readiness = waitForOwnedBackendReady({
      backendUrl: "http://127.0.0.1:8022",
      expectedNonce: "run-expected",
      expectedPid: 4242,
      timeoutMs: 25,
      getExitCode: () => null,
      fetchImpl,
      sleep: async () => {},
    });
    let guard;
    const guarded = Promise.race([
      readiness,
      new Promise((_, reject) => {
        guard = setTimeout(() => reject(new Error("test guard expired")), 500);
      }),
    ]).finally(() => clearTimeout(guard));

    await assert.rejects(guarded, /was not ready within 25ms/);
    assert.equal(aborted, true);
  });
}

test("teardown never kills a reused PID with a different process start token", async () => {
  const killed = [];
  await assert.rejects(
    stopOwnedProcess(
      { pid: 4242, startToken: "start-a" },
      {
        readStartToken: () => "start-b",
        killProcess: (pid) => killed.push(pid),
      },
    ),
    /process ownership mismatch/,
  );
  assert.deepEqual(killed, []);

  assert.equal(
    await stopOwnedProcess(
      { pid: 4242, startToken: "start-a" },
      { readStartToken: () => null, killProcess: (pid) => killed.push(pid) },
    ),
    "already-exited",
  );
  assert.deepEqual(killed, []);

  const tokens = ["start-a", null];
  assert.equal(
    await stopOwnedProcess(
      { pid: 4242, startToken: "start-a" },
      {
        readStartToken: () => tokens.shift(),
        killProcess: (pid) => killed.push(pid),
        sleep: async () => {},
      },
    ),
    "stopped",
  );
  assert.deepEqual(killed, [4242]);
});

test("failed process ownership proof preserves receipt and dedicated DB evidence", async () => {
  const actions = [];
  await assert.rejects(
    cleanupOwnedE2eRun({
      receipt: { pid: 4242, startToken: "start-a" },
      readStartToken: () => "start-b",
      killProcess: () => actions.push("kill"),
      removeDedicatedDb: () => actions.push("remove-db"),
      assertProtectedDbUnchanged: () => actions.push("verify-db"),
      removeArtifacts: () => actions.push("remove-artifacts"),
      sleep: async () => {},
    }),
    /process ownership mismatch/,
  );
  assert.deepEqual(actions, []);
});

test("failed owned-process termination preserves receipt and dedicated DB evidence", async () => {
  const actions = [];
  await assert.rejects(
    cleanupOwnedE2eRun({
      receipt: { pid: 4242, startToken: "start-a" },
      readStartToken: () => "start-a",
      killProcess: () => {
        actions.push("kill");
        throw new Error("simulated termination failure");
      },
      removeDedicatedDb: () => actions.push("remove-db"),
      assertProtectedDbUnchanged: () => actions.push("verify-db"),
      removeArtifacts: () => actions.push("remove-artifacts"),
      sleep: async () => {},
    }),
    /simulated termination failure/,
  );
  assert.deepEqual(actions, ["kill"]);
});

test("captured teardown rejects a foreign run nonce before kill or artifact mutation", async () => {
  const actions = [];
  await assert.rejects(
    cleanupCapturedOwnedE2eRun({
      expectedRunToken: "run-current",
      capturedReceipt: {
        pid: 4242,
        startToken: "start-current",
        runNonce: "run-current",
      },
      persistedReceipt: {
        pid: 4242,
        startToken: "start-current",
        runNonce: "run-foreign",
      },
      readStartToken: () => {
        actions.push("read-process");
        return "start-current";
      },
      killProcess: () => actions.push("kill"),
      removeDedicatedDb: () => actions.push("remove-db"),
      assertProtectedDbUnchanged: () => actions.push("verify-db"),
      removeArtifacts: () => actions.push("remove-artifacts"),
    }),
    /run nonce mismatch/,
  );
  assert.deepEqual(actions, []);
});

test("Windows process identity reads only the recorded PID start time", () => {
  const calls = [];
  const token = readProcessStartToken(4242, {
    platform: "win32",
    run: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "638928000000000000" };
    },
  });

  assert.equal(token, "win32:638928000000000000");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "powershell");
  assert.match(calls[0].args.join(" "), /Get-Process -Id 4242/);
  assert.doesNotMatch(calls[0].args.join(" "), /netstat|Get-Process\s*\|/i);
  assert.equal(calls[0].options.windowsHide, true);
});

test("real DB guard detects creation and WAL or SHM changes", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-db-family-"));
  const dbPath = path.join(tempRoot, "mes.db");
  try {
    const absent = snapshotFileFamily(dbPath);
    fs.writeFileSync(dbPath, "created-during-e2e");
    assert.throws(() => assertFileFamilyUnchanged(absent, snapshotFileFamily(dbPath)), /mes\.db/);

    fs.writeFileSync(`${dbPath}-wal`, "wal-before");
    fs.writeFileSync(`${dbPath}-shm`, "shm-before");
    const before = snapshotFileFamily(dbPath);
    assert.doesNotThrow(() => assertFileFamilyUnchanged(before, snapshotFileFamily(dbPath)));

    fs.writeFileSync(`${dbPath}-wal`, "wal-after");
    assert.throws(
      () => assertFileFamilyUnchanged(before, snapshotFileFamily(dbPath)),
      /mes\.db-wal/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Playwright lifecycle wires ownership, loopback, early-exit, and DB-family guards", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const setup = fs.readFileSync(path.join(root, "tests/e2e/global-setup.ts"), "utf-8");
  const teardown = fs.readFileSync(path.join(root, "tests/e2e/global-teardown.ts"), "utf-8");
  const lifecycle = fs.readFileSync(path.join(root, "tests/e2e/e2e-lifecycle.mjs"), "utf-8");
  const config = fs.readFileSync(path.join(root, "playwright.config.ts"), "utf-8");
  const runner = fs.readFileSync(path.join(root, "scripts/run-playwright-e2e.mjs"), "utf-8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
  const wrapper = fs.readFileSync(path.join(root, "../scripts/dev/verify_e2e.ps1"), "utf-8");
  const exclusiveBindProbe = fs.readFileSync(
    path.join(root, "../scripts/dev/e2e-exclusive-bind-probe.ps1"),
    "utf-8",
  );
  const e2eApp = fs.readFileSync(path.join(root, "../backend/scripts/e2e_app.py"), "utf-8");

  assert.match(config, /canonicalE2eBaseUrl\(process\.env\.E2E_BASE_URL, FRONT_PORT\)/);
  assert.match(config, /approvedE2eFrontendPort\(process\.env\.E2E_FRONTEND_PORT\)/);
  assert.match(config, /approvedE2eBackendPort\(process\.env\.E2E_BACKEND_PORT\)/);
  assert.match(config, /assertE2eRunOwnership\(\{ lockDir: LOCK_DIR, runToken: RUN_TOKEN \}\)/);
  assert.match(config, /env:\s*dedicatedE2eWebServerEnv\(BACKEND_PORT\)/);
  assert.doesNotMatch(config, /globalTeardown:/);
  assert.match(runner, /acquireE2eRunOwnership/);
  assert.match(runner, /spawnPlaywright/);
  assert.match(runner, /releaseE2eRunOwnership/);
  assert.equal(packageJson.scripts["test:e2e"], "node scripts/run-playwright-e2e.mjs");
  assert.match(packageJson.scripts["test:e2e:headed"], /run-playwright-e2e\.mjs --headed/);
  assert.match(packageJson.scripts["test:e2e:ui"], /run-playwright-e2e\.mjs --ui/);
  assert.match(setup, /prepareOwnedBackendPreflight/);
  assert.match(setup, /approvedE2eBackendPort\(process\.env\.E2E_BACKEND_PORT\)/);
  assert.match(setup, /spawn\(\s*PYTHON_EXECUTABLE/);
  assert.ok(
    setup.indexOf("await prepareOwnedBackendPreflight")
      < setup.indexOf("snapshotFileFamily(REAL_DB)"),
    "backend preflight must finish before DB-family snapshot or mutation",
  );
  assert.ok(
    setup.indexOf("await prepareOwnedBackendPreflight") < setup.indexOf("backend = spawn("),
    "backend port ownership must be checked before spawning uvicorn",
  );
  assert.ok(
    setup.indexOf("await prepareOwnedBackendPreflight") < setup.indexOf("snapshotFileFamily(REAL_DB)"),
    "port rejection must happen before artifact mutation or cleanup",
  );
  for (const mutation of [
    "fs.writeFileSync(HASH_FILE",
    "fs.rmSync(PROCESS_RECEIPT_FILE",
    "rmDbFamily(E2E_DB)",
  ]) {
    assert.ok(
      setup.indexOf("await prepareOwnedBackendPreflight") < setup.indexOf(mutation),
      `port rejection must happen before ${mutation}`,
    );
  }
  assert.match(setup, /scripts\.e2e_app:app/);
  assert.match(setup, /E2E_RUN_NONCE: runNonce/);
  assert.match(setup, /readProcessStartToken\(backend\.pid\)/);
  assert.match(setup, /waitForOwnedBackendReady/);
  assert.match(setup, /expectedNonce: runNonce/);
  assert.match(setup, /expectedPid: backend\.pid/);
  assert.match(e2eApp, /"pid": os\.getpid\(\)/);
  assert.match(lifecycle, /runWithinBackendReadinessDeadline/);
  assert.match(lifecycle, /E2E_BACKEND_READINESS_TIMEOUT/);
  assert.ok(
    setup.indexOf("await waitForOwnedBackendReady") < setup.indexOf("await seed(apiContext)"),
    "seed must not run before spawned backend identity and health are proven",
  );
  assert.match(setup, /snapshotFileFamily\(REAL_DB\)/);
  assert.match(setup, /return async \(\) => cleanupCapturedE2eRun/);

  assert.match(teardown, /cleanupCapturedOwnedE2eRun/);
  assert.match(teardown, /readProcessStartToken/);
  assert.match(teardown, /assertFileFamilyUnchanged/);
  assert.match(teardown, /phase: "cleanup-complete"/);
  assert.doesNotMatch(teardown, /netstat|lsof|BACKEND_PORT/);

  const backendPortCheck = wrapper.indexOf("Test-LoopbackPortAvailable -Port $BackendPort");
  const npmStart = wrapper.indexOf("npm run test:e2e");
  assert.notEqual(backendPortCheck, -1);
  assert.ok(backendPortCheck < npmStart, "port 8021 must fail closed before npm starts");
  assert.match(wrapper, /System\.Net\.Sockets\.TcpClient/);
  assert.match(wrapper, /e2e-exclusive-bind-probe\.ps1/);
  assert.match(exclusiveBindProbe, /ExclusiveAddressUse = \$true/);
  assert.match(wrapper, /\$BackendPort = 8022/);
  assert.match(wrapper, /\$env:E2E_BACKEND_PORT = \[string\] \$BackendPort/);
  assert.match(wrapper, /\$env:E2E_BACKEND_PORT = \$PreviousBackendPort/);
  assert.match(wrapper, /\$PreviousBaseUrl = \$env:E2E_BASE_URL/);
  assert.match(wrapper, /\$env:E2E_BASE_URL = "http:\/\/127\.0\.0\.1:\$FrontendPort"/);
  assert.match(wrapper, /\$env:E2E_BASE_URL = \$PreviousBaseUrl/);
});
