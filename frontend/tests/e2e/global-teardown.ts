/**
 * globalSetup이 현재 run token과 receipt를 캡처해 반환하는 teardown 구현.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  assertE2eRunOwnership,
  assertFileFamilyUnchanged,
  cleanupCapturedOwnedE2eRun,
  markE2eRunPhase,
  readProcessStartToken,
  snapshotFileFamily,
} from "./e2e-lifecycle.mjs";

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const REAL_DB = path.join(BACKEND_DIR, "mes.db");
const E2E_DB = path.join(BACKEND_DIR, "mes_e2e.db");

const PROCESS_RECEIPT_FILE = path.join(HERE, ".e2e-backend-process.json");
const HASH_FILE = path.join(HERE, ".e2e-realdb-family.json");
const SEED_FILE = path.join(HERE, ".e2e-seed.json");
const LOCK_DIR = path.join(HERE, ".e2e-run-lock");

const IS_WIN = process.platform === "win32";

function killPid(pid: number) {
  if (!pid) return;
  if (IS_WIN) {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf-8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`E2E 백엔드 PID ${pid} 종료 실패(code ${result.status})`);
    }
  } else {
    // detached spawn 은 새 프로세스 그룹의 리더 → 그룹(-pid) kill, 실패 시 단건.
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* 이미 종료 */
      }
    }
  }
}

type ProcessReceipt = {
  pid: number;
  startToken: string;
  runNonce: string;
};

type ProtectedDbFamily = ReturnType<typeof snapshotFileFamily>;

export async function cleanupCapturedE2eRun({
  runToken,
  receipt,
  protectedDbFamily,
}: {
  runToken: string;
  receipt: ProcessReceipt;
  protectedDbFamily: ProtectedDbFamily;
}) {
  assertE2eRunOwnership({ lockDir: LOCK_DIR, runToken });
  if (!fs.existsSync(PROCESS_RECEIPT_FILE)) {
    throw new Error("E2E backend process receipt가 없어 종료 대상을 확인할 수 없습니다.");
  }
  const persistedReceipt = JSON.parse(
    fs.readFileSync(PROCESS_RECEIPT_FILE, "utf-8"),
  ) as ProcessReceipt;
  if (!fs.existsSync(HASH_FILE)) {
    throw new Error("E2E protected DB family baseline이 없습니다.");
  }
  const persistedProtectedDbFamily = JSON.parse(
    fs.readFileSync(HASH_FILE, "utf-8"),
  ) as ProtectedDbFamily;
  if (JSON.stringify(persistedProtectedDbFamily) !== JSON.stringify(protectedDbFamily)) {
    throw new Error("E2E protected DB family baseline ownership이 일치하지 않습니다.");
  }

  await cleanupCapturedOwnedE2eRun({
    expectedRunToken: runToken,
    capturedReceipt: receipt,
    persistedReceipt,
    readStartToken: readProcessStartToken,
    killProcess: killPid,
    removeDedicatedDb: () => {
      for (const suffix of ["", "-wal", "-shm"]) {
        fs.rmSync(E2E_DB + suffix, { force: true });
      }
    },
    assertProtectedDbUnchanged: () => {
      assertFileFamilyUnchanged(protectedDbFamily, snapshotFileFamily(REAL_DB));
      console.log("[e2e:teardown] 실 mes.db 불변 확인");
    },
    removeArtifacts: () => {
      fs.rmSync(PROCESS_RECEIPT_FILE, { force: true });
      fs.rmSync(HASH_FILE, { force: true });
      fs.rmSync(SEED_FILE, { force: true });
    },
  });
  markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "cleanup-complete" });
  console.log("[e2e:teardown] 정리 완료");
}
