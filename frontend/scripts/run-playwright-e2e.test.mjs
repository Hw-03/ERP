import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  markE2eRunPhase,
} from "../tests/e2e/e2e-lifecycle.mjs";
import {
  defaultE2eOwnershipPaths,
  runPlaywrightE2e,
} from "./run-playwright-e2e.mjs";

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function hashTree(root) {
  if (!fs.existsSync(root)) return "absent";
  const hash = createHash("sha256");
  const visit = (current) => {
    const stat = fs.statSync(current);
    const relative = path.relative(root, current).split(path.sep).join("/");
    hash.update(`${relative}:${stat.isDirectory() ? "dir" : "file"}\n`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name));
    } else {
      hash.update(fs.readFileSync(current));
    }
  };
  visit(root);
  return hash.digest("hex");
}

function makePaths(tempRoot) {
  const frontendRoot = path.join(tempRoot, "frontend");
  const backendDir = path.join(tempRoot, "backend");
  fs.mkdirSync(path.join(frontendRoot, "tests", "e2e"), { recursive: true });
  fs.mkdirSync(backendDir, { recursive: true });
  return defaultE2eOwnershipPaths({ frontendRoot, backendDir });
}

test("invalid employee-environment ports fail before probe, spawn, or artifact mutation", async () => {
  for (const rejectedPort of ["8010", "8011"]) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-port-"));
    const paths = makePaths(tempRoot);
    const calls = { barrier: 0, probe: 0, spawn: 0 };
    try {
      const before = hashTree(tempRoot);
      await assert.rejects(
        runPlaywrightE2e({
          env: { E2E_FRONTEND_PORT: rejectedPort },
          paths,
          beforeAcquire: async () => { calls.barrier += 1; },
          probeBackend: async () => { calls.probe += 1; return true; },
          spawnPlaywright: async () => { calls.spawn += 1; return { exitCode: 0, signal: null }; },
          tokenFactory: () => `run-${rejectedPort}`,
        }),
        /approved E2E frontend port/,
      );
      assert.deepEqual(calls, { barrier: 0, probe: 0, spawn: 0 });
      assert.equal(hashTree(tempRoot), before);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("an occupied approved frontend port fails before backend probe, spawn, or artifact mutation", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-frontend-port-"));
  const paths = makePaths(tempRoot);
  const calls = { frontendProbe: 0, backendProbe: 0, spawn: 0 };
  try {
    const before = hashTree(tempRoot);
    await assert.rejects(
      runPlaywrightE2e({
        env: { E2E_FRONTEND_PORT: "3300" },
        paths,
        probeFrontend: async (port) => {
          calls.frontendProbe += 1;
          assert.equal(port, 3300);
          return false;
        },
        probeBackend: async () => { calls.backendProbe += 1; return true; },
        spawnPlaywright: async () => {
          calls.spawn += 1;
          return { exitCode: 0, signal: null };
        },
        tokenFactory: () => "run-occupied-frontend",
      }),
      /dedicated frontend port 3300 is already in use/,
    );
    assert.deepEqual(calls, { frontendProbe: 1, backendProbe: 0, spawn: 0 });
    assert.equal(hashTree(tempRoot), before);
    assert.equal(fs.existsSync(paths.lockDir), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("the runner selects backend fallback 8022 and forwards one shared port contract", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-backend-fallback-"));
  const paths = makePaths(tempRoot);
  const probed = [];
  let capturedBackendPort;
  try {
    const result = await runPlaywrightE2e({
      env: { E2E_FRONTEND_PORT: "3300" },
      paths,
      probeFrontend: async () => true,
      probeBackend: async (port) => {
        probed.push(port);
        return port === 8022;
      },
      spawnPlaywright: async ({ env, onSpawn }) => {
        capturedBackendPort = env.E2E_BACKEND_PORT;
        onSpawn();
        markE2eRunPhase({
          lockDir: paths.lockDir,
          runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
          phase: "cleanup-complete",
        });
        return { exitCode: 0, signal: null };
      },
      tokenFactory: () => "run-backend-fallback",
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(probed, [8021, 8022, 8022]);
    assert.equal(capturedBackendPort, "8022");
    assert.equal(fs.existsSync(paths.lockDir), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("both occupied backend ports fail before lock, spawn, or artifact mutation", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-backend-busy-"));
  const paths = makePaths(tempRoot);
  const calls = { barrier: 0, frontendProbe: 0, backendProbe: 0, spawn: 0 };
  try {
    const before = hashTree(tempRoot);
    await assert.rejects(
      runPlaywrightE2e({
        env: { E2E_FRONTEND_PORT: "3300" },
        paths,
        beforeAcquire: async () => { calls.barrier += 1; },
        probeFrontend: async () => { calls.frontendProbe += 1; return true; },
        probeBackend: async () => { calls.backendProbe += 1; return false; },
        spawnPlaywright: async () => {
          calls.spawn += 1;
          return { exitCode: 0, signal: null };
        },
        tokenFactory: () => "run-backend-busy",
      }),
      /backend ports unavailable: 8021 and fallback 8022/,
    );
    assert.deepEqual(calls, { barrier: 0, frontendProbe: 1, backendProbe: 2, spawn: 0 });
    assert.equal(hashTree(tempRoot), before);
    assert.equal(fs.existsSync(paths.lockDir), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a forbidden configured backend port fails before probe, spawn, or mutation", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-backend-invalid-"));
  const paths = makePaths(tempRoot);
  const calls = { frontendProbe: 0, backendProbe: 0, spawn: 0 };
  try {
    const before = hashTree(tempRoot);
    await assert.rejects(
      runPlaywrightE2e({
        env: { E2E_FRONTEND_PORT: "3300", E2E_BACKEND_PORT: "8011" },
        paths,
        probeFrontend: async () => { calls.frontendProbe += 1; return true; },
        probeBackend: async () => { calls.backendProbe += 1; return true; },
        spawnPlaywright: async () => {
          calls.spawn += 1;
          return { exitCode: 0, signal: null };
        },
      }),
      /approved E2E backend port/,
    );
    assert.deepEqual(calls, { frontendProbe: 0, backendProbe: 0, spawn: 0 });
    assert.equal(hashTree(tempRoot), before);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a selected backend port lost before lock acquisition is not reselected or spawned", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-backend-race-"));
  const paths = makePaths(tempRoot);
  const backendProbes = [];
  let backendAvailable = true;
  let spawnCount = 0;
  try {
    const before = hashTree(tempRoot);
    await assert.rejects(
      runPlaywrightE2e({
        env: { E2E_FRONTEND_PORT: "3300" },
        paths,
        beforeAcquire: async () => { backendAvailable = false; },
        probeFrontend: async () => true,
        probeBackend: async (port) => {
          backendProbes.push(port);
          return backendAvailable;
        },
        spawnPlaywright: async () => {
          spawnCount += 1;
          return { exitCode: 0, signal: null };
        },
        tokenFactory: () => "run-backend-race",
      }),
      /dedicated backend port 8021 is already in use/,
    );

    assert.deepEqual(backendProbes, [8021, 8021]);
    assert.equal(spawnCount, 0);
    assert.equal(fs.existsSync(paths.lockDir), false);
    assert.equal(hashTree(tempRoot), before);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("barrier-concurrent runners produce one winner and a mutation-free loser", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-concurrent-"));
  const paths = makePaths(tempRoot);
  const resultsDir = path.join(tempRoot, "frontend", "test-results");
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, "baseline.txt"), "unchanged-until-winner-starts");
  const barrier = deferred();
  const spawned = deferred();
  const finishWinner = deferred();
  let arrived = 0;
  let spawnCount = 0;
  const ownershipResults = [];
  const beforeAcquire = async () => {
    arrived += 1;
    if (arrived === 2) barrier.resolve();
    await barrier.promise;
  };
  const spawnPlaywright = async ({ env, onSpawn }) => {
    spawnCount += 1;
    onSpawn();
    fs.writeFileSync(path.join(resultsDir, "winner.txt"), env.DEXCOWIN_E2E_RUN_TOKEN);
    ownershipResults.push(`winner:${env.DEXCOWIN_E2E_RUN_TOKEN}`);
    spawned.resolve();
    await finishWinner.promise;
    markE2eRunPhase({
      lockDir: paths.lockDir,
      runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
      phase: "cleanup-complete",
    });
    return { exitCode: 0, signal: null };
  };
  try {
    let tokenIndex = 0;
    const options = () => ({
      env: { E2E_FRONTEND_PORT: "3300" },
      paths,
      beforeAcquire,
      probeFrontend: async () => true,
      probeBackend: async () => true,
      spawnPlaywright,
      tokenFactory: () => `run-${++tokenIndex}`,
      logger: { log: (line) => ownershipResults.push(line) },
    });
    const first = runPlaywrightE2e(options());
    const second = runPlaywrightE2e(options());
    const settledBeforeWinnerClose = await Promise.race([
      Promise.allSettled([first, second]),
      spawned.promise.then(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return null;
      }),
    ]);
    assert.equal(settledBeforeWinnerClose, null);
    const loserHash = hashTree(resultsDir);
    await assert.rejects(
      Promise.race([
        first.catch((error) => { throw error; }),
        second.catch((error) => { throw error; }),
      ]),
      /already active/,
    );
    assert.equal(hashTree(resultsDir), loserHash);
    assert.equal(spawnCount, 1);
    finishWinner.resolve();
    const finalResults = await Promise.allSettled([first, second]);
    assert.equal(finalResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(finalResults.filter((result) => result.status === "rejected").length, 1);
    assert.equal(fs.existsSync(paths.lockDir), false);
    assert.ok(ownershipResults.some((line) => line.startsWith("winner:")));
  } finally {
    finishWinner.resolve();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a previous receipt blocks setup and teardown adoption before any probe or spawn", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-receipt-"));
  const paths = makePaths(tempRoot);
  const previousReceipt = JSON.stringify({
    version: 2,
    pid: 4242,
    startToken: "old-start",
    runNonce: "old-run",
  });
  fs.writeFileSync(paths.receiptFile, previousReceipt);
  fs.writeFileSync(paths.e2eDb, "old-db");
  const before = hashTree(tempRoot);
  const calls = { probe: 0, spawn: 0, kill: 0 };
  try {
    await assert.rejects(
      runPlaywrightE2e({
        env: {},
        paths,
        probeFrontend: async () => true,
        probeBackend: async () => { calls.probe += 1; return false; },
        spawnPlaywright: async () => { calls.spawn += 1; return { exitCode: 0, signal: null }; },
        tokenFactory: () => "new-run",
      }),
      /existing E2E ownership artifact/,
    );
    assert.deepEqual(calls, { probe: 0, spawn: 0, kill: 0 });
    assert.equal(fs.readFileSync(paths.receiptFile, "utf-8"), previousReceipt);
    assert.equal(hashTree(tempRoot), before);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("missing cleanup evidence preserves the run lock, receipt, and dedicated DB", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-preserve-"));
  const paths = makePaths(tempRoot);
  try {
    await assert.rejects(
      runPlaywrightE2e({
        env: {},
        paths,
        probeFrontend: async () => true,
        probeBackend: async () => true,
        spawnPlaywright: async ({ onSpawn }) => {
          onSpawn();
          fs.writeFileSync(paths.receiptFile, "receipt-evidence");
          fs.writeFileSync(paths.e2eDb, "db-evidence");
          return { exitCode: 1, signal: null };
        },
        tokenFactory: () => "run-preserve",
      }),
      /cleanup evidence is incomplete/,
    );
    assert.equal(fs.existsSync(paths.lockDir), true);
    assert.equal(fs.readFileSync(paths.receiptFile, "utf-8"), "receipt-evidence");
    assert.equal(fs.readFileSync(paths.e2eDb, "utf-8"), "db-evidence");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a signaled Playwright child preserves the lock even after backend cleanup marker", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-signal-"));
  const paths = makePaths(tempRoot);
  try {
    await assert.rejects(
      runPlaywrightE2e({
        env: {},
        paths,
        probeFrontend: async () => true,
        probeBackend: async () => true,
        spawnPlaywright: async ({ env, onSpawn }) => {
          onSpawn();
          markE2eRunPhase({
            lockDir: paths.lockDir,
            runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
            phase: "cleanup-complete",
          });
          return { exitCode: null, signal: "SIGTERM" };
        },
        tokenFactory: () => "run-signal",
      }),
      /signal SIGTERM/,
    );
    assert.equal(fs.existsSync(paths.lockDir), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a normal nonzero Playwright exit releases a cleanup-complete lock", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-nonzero-"));
  const paths = makePaths(tempRoot);
  try {
    const result = await runPlaywrightE2e({
      env: {},
      paths,
      probeFrontend: async () => true,
      probeBackend: async () => true,
      spawnPlaywright: async ({ env, onSpawn }) => {
        onSpawn();
        markE2eRunPhase({
          lockDir: paths.lockDir,
          runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
          phase: "cleanup-complete",
        });
        return { exitCode: 1, signal: null };
      },
      tokenFactory: () => "run-nonzero",
    });
    assert.deepEqual(result, { exitCode: 1, signal: null });
    assert.equal(fs.existsSync(paths.lockDir), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a pre-mutation setup failure releases a safe-abort lock without artifacts", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-safe-abort-"));
  const paths = makePaths(tempRoot);
  try {
    const before = hashTree(tempRoot);
    const result = await runPlaywrightE2e({
      env: {},
      paths,
      probeFrontend: async () => true,
      probeBackend: async () => true,
      spawnPlaywright: async ({ env, onSpawn }) => {
        onSpawn();
        markE2eRunPhase({
          lockDir: paths.lockDir,
          runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
          phase: "safe-abort",
        });
        return { exitCode: 1, signal: null };
      },
      tokenFactory: () => "run-safe-abort",
    });

    assert.deepEqual(result, { exitCode: 1, signal: null });
    assert.equal(fs.existsSync(paths.lockDir), false);
    assert.equal(hashTree(tempRoot), before);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("the runner replaces inherited ownership and forwards every Playwright argument", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dexcowin-e2e-args-"));
  const paths = makePaths(tempRoot);
  let captured;
  try {
    const result = await runPlaywrightE2e({
      args: ["--headed", "tests/e2e/io-receive.spec.ts"],
      env: { DEXCOWIN_E2E_RUN_TOKEN: "foreign-token" },
      paths,
      probeFrontend: async () => true,
      probeBackend: async () => true,
      spawnPlaywright: async ({ args, env, onSpawn }) => {
        captured = { args, token: env.DEXCOWIN_E2E_RUN_TOKEN };
        onSpawn();
        markE2eRunPhase({
          lockDir: paths.lockDir,
          runToken: env.DEXCOWIN_E2E_RUN_TOKEN,
          phase: "cleanup-complete",
        });
        return { exitCode: 0, signal: null };
      },
      tokenFactory: () => "owned-token",
    });
    assert.deepEqual(captured, {
      args: ["--headed", "tests/e2e/io-receive.spec.ts"],
      token: "owned-token",
    });
    assert.equal(result.exitCode, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("raw Playwright CLI without runner ownership fails before test-results mutation", () => {
  const resultsDir = path.join(FRONTEND_ROOT, "test-results");
  const before = hashTree(resultsDir);
  const env = { ...process.env };
  delete env.DEXCOWIN_E2E_RUN_TOKEN;
  const cli = path.join(FRONTEND_ROOT, "node_modules", "playwright", "cli.js");
  const result = spawnSync(process.execPath, [cli, "test", "--list"], {
    cwd: FRONTEND_ROOT,
    env,
    encoding: "utf-8",
    windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /E2E runner ownership is required/);
  assert.equal(hashTree(resultsDir), before);
});
