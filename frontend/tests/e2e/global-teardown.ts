/**
 * Playwright globalTeardown — 전용 백엔드 종료 + 전용 DB 삭제 + 실 mes.db 불변 검증.
 */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const REAL_DB = path.join(BACKEND_DIR, "mes.db");
const E2E_DB = path.join(BACKEND_DIR, "mes_e2e.db");
const BACKEND_PORT = 8021;

const PID_FILE = path.join(HERE, ".e2e-backend.pid");
const HASH_FILE = path.join(HERE, ".e2e-realdb-hash");
const SEED_FILE = path.join(HERE, ".e2e-seed.json");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function killBackend() {
  // 1) pid 파일로 트리 종료
  if (fs.existsSync(PID_FILE)) {
    const pid = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (pid) spawnSync("taskkill", ["/PID", pid, "/T", "/F"]);
  }
  // 2) 포트 점유 잔존 프로세스 폴백 종료(netstat → taskkill)
  const ns = spawnSync("netstat", ["-ano"], { encoding: "utf-8" });
  if (ns.stdout) {
    const pids = new Set<string>();
    for (const line of ns.stdout.split(/\r?\n/)) {
      if (line.includes(`:${BACKEND_PORT}`) && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
    }
    for (const pid of pids) spawnSync("taskkill", ["/PID", pid, "/T", "/F"]);
  }
}

export default async function globalTeardown() {
  killBackend();

  // 전용 DB 삭제
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(E2E_DB + suffix, { force: true });
  }

  // 실 mes.db 불변 검증
  if (fs.existsSync(HASH_FILE) && fs.existsSync(REAL_DB)) {
    const before = fs.readFileSync(HASH_FILE, "utf-8").trim();
    const after = sha256(REAL_DB);
    fs.rmSync(HASH_FILE, { force: true });
    if (before !== after) {
      throw new Error(
        `[e2e:teardown] 치명적: 실 mes.db 가 e2e 도중 변경됨!\n before=${before}\n after =${after}`,
      );
    }
    console.log("[e2e:teardown] 실 mes.db 불변 확인");
  }

  fs.rmSync(PID_FILE, { force: true });
  fs.rmSync(SEED_FILE, { force: true });
  console.log("[e2e:teardown] 정리 완료");
}
