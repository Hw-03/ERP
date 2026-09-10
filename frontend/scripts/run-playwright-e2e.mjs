import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertSupportedNodeVersion } from "./require-node-20.mjs";
import {
  acquireE2eRunOwnership,
  approvedE2eBackendPort,
  approvedE2eFrontendPort,
  assertE2eRunOwnership,
  canonicalE2eBaseUrl,
  ensureDedicatedPortAvailable,
  markE2eRunPhase,
  probeLoopbackPort,
  releaseE2eRunOwnership,
  selectDedicatedBackendPort,
} from "../tests/e2e/e2e-lifecycle.mjs";

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");

export function defaultE2eOwnershipPaths({
  frontendRoot = FRONTEND_ROOT,
  backendDir = BACKEND_DIR,
} = {}) {
  const e2eDir = path.join(frontendRoot, "tests", "e2e");
  const e2eDb = path.join(backendDir, "mes_e2e.db");
  return {
    frontendRoot,
    backendDir,
    lockDir: path.join(e2eDir, ".e2e-run-lock"),
    receiptFile: path.join(e2eDir, ".e2e-backend-process.json"),
    hashFile: path.join(e2eDir, ".e2e-realdb-family.json"),
    seedFile: path.join(e2eDir, ".e2e-seed.json"),
    e2eDb,
    guardedArtifacts: [
      path.join(e2eDir, ".e2e-backend-process.json"),
      path.join(e2eDir, ".e2e-realdb-family.json"),
      path.join(e2eDir, ".e2e-seed.json"),
      e2eDb,
      `${e2eDb}-wal`,
      `${e2eDb}-shm`,
    ],
  };
}

function assertNoExistingE2eArtifacts(paths, fsImpl = fs) {
  const existing = paths.guardedArtifacts.filter((artifact) => fsImpl.existsSync(artifact));
  if (existing.length > 0) {
    throw new Error(
      `An existing E2E ownership artifact blocks a new run: ${existing.join(", ")}`,
    );
  }
}

function childEnvironment(parentEnv, runToken, frontendPort, backendPort) {
  const env = { ...parentEnv };
  delete env.E2E_RUN_NONCE;
  env.DEXCOWIN_E2E_RUN_TOKEN = runToken;
  env.E2E_FRONTEND_PORT = String(frontendPort);
  env.E2E_BACKEND_PORT = String(backendPort);
  return env;
}

async function spawnPlaywrightProcess({ args, env, onSpawn, paths }) {
  const cli = path.join(paths.frontendRoot, "node_modules", "playwright", "cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", ...args], {
      cwd: paths.frontendRoot,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    onSpawn();
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

export async function runPlaywrightE2e({
  args = process.argv.slice(2),
  env = process.env,
  paths = defaultE2eOwnershipPaths(),
  beforeAcquire = async () => {},
  probeFrontend = probeLoopbackPort,
  probeBackend = probeLoopbackPort,
  spawnPlaywright = spawnPlaywrightProcess,
  tokenFactory = randomUUID,
  logger = console,
  fsImpl = fs,
  runnerPid = process.pid,
} = {}) {
  const frontendPort = approvedE2eFrontendPort(env.E2E_FRONTEND_PORT);
  if (env.E2E_BACKEND_PORT !== undefined) {
    approvedE2eBackendPort(env.E2E_BACKEND_PORT);
  }
  canonicalE2eBaseUrl(env.E2E_BASE_URL, frontendPort);
  assertNoExistingE2eArtifacts(paths, fsImpl);
  await ensureDedicatedPortAvailable(frontendPort, probeFrontend, "frontend");
  const backendPort = await selectDedicatedBackendPort(env.E2E_BACKEND_PORT, probeBackend);

  const runToken = tokenFactory();
  await beforeAcquire({ runToken });
  acquireE2eRunOwnership({ lockDir: paths.lockDir, runToken, runnerPid, fsImpl });
  logger.log(`[e2e:runner] ownership-result=acquired token=${runToken}`);

  let childStarted = false;
  try {
    assertNoExistingE2eArtifacts(paths, fsImpl);
    await ensureDedicatedPortAvailable(frontendPort, probeFrontend, "frontend");
    await ensureDedicatedPortAvailable(backendPort, probeBackend);
    const childEnv = childEnvironment(env, runToken, frontendPort, backendPort);
    logger.log(`[e2e:runner] ports frontend=${frontendPort} backend=${backendPort}`);
    const result = await spawnPlaywright({
      args,
      env: childEnv,
      paths,
      onSpawn: () => {
        childStarted = true;
        markE2eRunPhase({
          lockDir: paths.lockDir,
          runToken,
          phase: "playwright-running",
          fsImpl,
        });
      },
    });
    if (result.signal) {
      throw new Error(
        `Playwright exited from signal ${result.signal}; preserving run ownership evidence`,
      );
    }
    const owner = assertE2eRunOwnership({ lockDir: paths.lockDir, runToken, fsImpl });
    if (owner.phase !== "cleanup-complete" && owner.phase !== "safe-abort") {
      throw new Error(
        `E2E cleanup evidence is incomplete (phase=${owner.phase}); preserving lock and artifacts`,
      );
    }
    releaseE2eRunOwnership({ lockDir: paths.lockDir, runToken, fsImpl });
    logger.log(`[e2e:runner] ownership-result=released phase=${owner.phase}`);
    return result;
  } catch (error) {
    if (!childStarted) {
      markE2eRunPhase({
        lockDir: paths.lockDir,
        runToken,
        phase: "safe-abort",
        fsImpl,
      });
      releaseE2eRunOwnership({ lockDir: paths.lockDir, runToken, fsImpl });
      logger.log("[e2e:runner] ownership-result=released phase=safe-abort");
    } else {
      logger.log("[e2e:runner] ownership-result=preserved phase=incomplete-cleanup");
    }
    throw error;
  }
}

async function main() {
  assertSupportedNodeVersion(process.version);
  try {
    const result = await runPlaywrightE2e();
    process.exitCode = result.exitCode ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
