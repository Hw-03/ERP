/**
 * Playwright globalSetup — e2e 전용 DB + 전용 백엔드 + 시드.
 *
 * 가드레일: 실 backend/mes.db 는 절대 건드리지 않는다.
 *  - 전용 DB: backend/mes_e2e.db (teardown 에서 삭제)
 *  - 전용 백엔드 포트 8021 또는 8022 / 전용 프론트 포트 3100 또는 3300~3399
 *  - setup 시작 시 실 mes.db/-wal/-shm 존재 여부와 SHA256 기록 → teardown 에서 불변 검증
 *
 * 흐름:
 *  1) 실 mes.db/-wal/-shm 상태 기록
 *  2) mes_e2e.db* 삭제 → bootstrap_db.py --all (DATABASE_URL=전용DB)
 *  3) 선택된 전용 포트에 uvicorn 백엔드 기동 → /health/ready 폴링
 *  4) API 시드(품목/BOM/직원 확보) → .e2e-seed.json 저장
 * 프론트(custom Next server)는 playwright.config webServer 가 선택된 BACKEND_INTERNAL_URL로 프록시.
 */
import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { request, type APIRequestContext } from "@playwright/test";
import { assertSupportedNodeVersion } from "../../scripts/require-node-20.cjs";
import {
  approvedE2eBackendPort,
  assertE2eRunOwnership,
  assertFileFamilyUnchanged,
  markE2eRunPhase,
  prepareOwnedBackendPreflight,
  readProcessStartToken,
  snapshotFileFamily,
  waitForOwnedBackendReady,
} from "./e2e-lifecycle.mjs";
import { cleanupCapturedE2eRun } from "./global-teardown";

assertSupportedNodeVersion(process.version);

const HERE = __dirname; // frontend/tests/e2e
const REPO_ROOT = path.resolve(HERE, "..", "..", ".."); // c:\ERP
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const REAL_DB = path.join(BACKEND_DIR, "mes.db");
const E2E_DB = path.join(BACKEND_DIR, "mes_e2e.db");
const DATABASE_URL = `sqlite:///${E2E_DB.split(path.sep).join("/")}`;

const BACKEND_PORT = approvedE2eBackendPort(process.env.E2E_BACKEND_PORT);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const OPERATOR_PIN = process.env.E2E_OPERATOR_PIN ?? "2468";
const OPERATOR_SESSION_COOKIE = "dexcowin_operator_session";

const PROCESS_RECEIPT_FILE = path.join(HERE, ".e2e-backend-process.json");
const HASH_FILE = path.join(HERE, ".e2e-realdb-family.json");
const SEED_FILE = path.join(HERE, ".e2e-seed.json");
const LOCK_DIR = path.join(HERE, ".e2e-run-lock");

function assertSetupArtifactsAbsent() {
  const guardedArtifacts = [
    PROCESS_RECEIPT_FILE,
    HASH_FILE,
    SEED_FILE,
    E2E_DB,
    `${E2E_DB}-wal`,
    `${E2E_DB}-shm`,
  ];
  const existing = guardedArtifacts.filter((artifact) => fs.existsSync(artifact));
  if (existing.length > 0) {
    throw new Error(`기존 E2E ownership 산출물이 있어 setup을 거부합니다: ${existing.join(", ")}`);
  }
}

function rmDbFamily(base: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = base + suffix;
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
}


async function stopSpawnedChildHandle(backend: ReturnType<typeof spawn>): Promise<void> {
  if (backend.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => backend.once("exit", () => resolve()));
  if (!backend.kill("SIGKILL") && backend.exitCode === null) {
    throw new Error("receipt 작성 전 E2E 백엔드 종료 요청에 실패했습니다.");
  }
  await Promise.race([
    exited,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error("receipt 작성 전 E2E 백엔드가 종료되지 않았습니다.")),
      2_000,
    )),
  ]);
}

async function getJson(context: APIRequestContext, url: string): Promise<any> {
  const r = await context.get(url);
  if (!r.ok()) throw new Error(`GET ${url} → ${r.status()} ${await r.text()}`);
  return r.json();
}

async function sendJson(context: APIRequestContext, method: string, url: string, body: unknown): Promise<any> {
  // bc5ad563 이후 /api/employees POST·PUT·DELETE 등이 X-Admin-Pin 가드를 요구한다.
  // setup 은 admin 권한으로 직원 역할을 부여하므로 기본 PIN 을 항상 동봉한다.
  const r = await context.fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000",
    },
    data: body,
  });
  if (!r.ok()) throw new Error(`${method} ${url} → ${r.status()} ${await r.text()}`);
  return r.json();
}
const postJson = (context: APIRequestContext, url: string, body: unknown) => sendJson(context, "POST", url, body);
const putJson = (context: APIRequestContext, url: string, body: unknown) => sendJson(context, "PUT", url, body);

async function prepareOperatorPin(context: APIRequestContext, employeeId: string): Promise<void> {
  const challenge = await context.post("/api/operator-session", {
    data: { employee_id: employeeId, pin: "0000" },
  });
  if (challenge.status() !== 409) {
    throw new Error(`E2E 최초 PIN challenge 실패 → ${challenge.status()} ${await challenge.text()}`);
  }
  const complete = await context.post("/api/operator-session/complete-pin-change", {
    data: { employee_id: employeeId, new_pin: OPERATOR_PIN },
  });
  if (complete.status() !== 204) {
    throw new Error(`E2E 최초 PIN 설정 실패 → ${complete.status()} ${await complete.text()}`);
  }
}

async function loginOperator(context: APIRequestContext, employeeId: string): Promise<void> {
  const login = await context.post("/api/operator-session", {
    data: { employee_id: employeeId, pin: OPERATOR_PIN },
  });
  if (login.status() !== 200) {
    throw new Error(`E2E 작업자 로그인 실패 → ${login.status()} ${await login.text()}`);
  }
}

type StoredCookie = Awaited<ReturnType<APIRequestContext["storageState"]>>["cookies"][number];

async function readOperatorCookie(context: APIRequestContext): Promise<StoredCookie> {
  const state = await context.storageState();
  const operatorCookie = state.cookies.find(
    (cookie) => cookie.name === OPERATOR_SESSION_COOKIE && cookie.httpOnly,
  );
  if (!operatorCookie) {
    throw new Error("E2E 작업자 로그인 응답에 HttpOnly operator cookie가 없습니다.");
  }
  return operatorCookie;
}

async function issueReusableOperatorCookie(employeeId: string): Promise<StoredCookie> {
  const context = await request.newContext({ baseURL: BACKEND_URL });
  try {
    await loginOperator(context, employeeId);
    return await readOperatorCookie(context);
  } finally {
    await context.dispose();
  }
}

async function seed(context: APIRequestContext) {
  if (!/^\d{4}$/.test(OPERATOR_PIN) || OPERATOR_PIN === "0000") {
    throw new Error("E2E_OPERATOR_PIN은 0000이 아닌 숫자 4자리여야 합니다.");
  }
  // bootstrap 의 26명 직원에는 결재 역할이 없다(전부 none).
  // e2e 전제(원자재 입고=창고역할 전용, 결재 승인자 필요)를 위해 역할을 부여한다.
  const emps: any[] = await getJson(context, "/api/employees?active_only=true");
  const byCode = (code: string) => emps.find((e) => e.employee_code === code);
  const whBase = byCode("E22") ?? emps[0]; // 이필욱 — 창고 결재자 + 원자재 입고 작업자
  const deptBase = byCode("E04") ?? emps[1] ?? emps[0]; // 김건호 — 부서 결재자
  const plainBase = byCode("E01") ?? emps.find((e) => e.employee_id !== whBase.employee_id); // 일반 작업자(제출자)
  // 인증 UI E2E 전용: 아래 3명의 작업 PIN을 준비해도 기본 PIN challenge가 남는 직원을 보존한다.
  const defaultPinBase = byCode("E02") ?? emps.find((e) =>
    ![whBase.employee_id, deptBase.employee_id, plainBase?.employee_id].includes(e.employee_id),
  );
  if (!defaultPinBase) throw new Error("E2E 기본 PIN 검증용 직원을 찾을 수 없습니다.");

  const operatorIds = Array.from(new Set([whBase.employee_id, deptBase.employee_id, plainBase.employee_id]));
  for (const employeeId of operatorIds) {
    await prepareOperatorPin(context, employeeId);
  }
  await loginOperator(context, plainBase.employee_id);

  const warehouseEmployee = await putJson(context, `/api/employees/${whBase.employee_id}`, {
    warehouse_role: "primary",
  });
  const departmentEmployee = await putJson(context, `/api/employees/${deptBase.employee_id}`, {
    department_role: "primary",
  });
  const plainEmployee = plainBase;

  // 품목: 원자재(TR) + 조립 부모(TA), 원자재에 창고 재고 충분히.
  const rawItem = await postJson(context, "/api/items", {
    item_name: "E2E원자재튜브",
    process_type_code: "TR",
    unit: "EA",
    model_slots: [1],
    legacy_item_type: "원자재",
    min_stock: 0,
    initial_quantity: 500,
  });
  const parentItem = await postJson(context, "/api/items", {
    item_name: "E2E조립튜브",
    process_type_code: "TA",
    unit: "EA",
    model_slots: [1],
    legacy_item_type: "원자재",
    min_stock: 0,
    initial_quantity: 1,
  });
  const shippingPaItem = await postJson(context, "/api/items", {
    item_name: "E2E출하PA",
    process_type_code: "PA",
    unit: "EA",
    model_slots: [1],
    legacy_item_type: "반제품",
    min_stock: 0,
    initial_quantity: 1,
  });
  const shippingItem = await postJson(context, "/api/items", {
    item_name: "E2E출하PF",
    process_type_code: "PF",
    unit: "EA",
    model_slots: [1],
    legacy_item_type: "완제품",
    min_stock: 0,
    initial_quantity: 1,
  });
  await postJson(context, "/api/bom", {
    parent_item_id: shippingPaItem.item_id,
    child_item_id: rawItem.item_id,
    quantity: 1,
    unit: "EA",
  });
  await postJson(context, "/api/bom", {
    parent_item_id: shippingItem.item_id,
    child_item_id: shippingPaItem.item_id,
    quantity: 1,
    unit: "EA",
  });
  // BOM: 부모(TA) → 자식(TR) x2 — produce 의 자동 전개 대상.
  await postJson(context, "/api/bom", {
    parent_item_id: parentItem.item_id,
    child_item_id: rawItem.item_id,
    quantity: 2,
    unit: "EA",
  });

  // produce 는 자식 자재를 부서(조립) PRODUCTION 재고에서 소비한다(창고 아님).
  // 창고 재고만으로는 "재고 부족" → 제출 불가 → 자식 일부를 조립 부서 생산재고로 이동.
  // API가 없어 actor-required StockRequest facade로 이동한다. 코드는 ASCII만 사용한다.
  const seedPy = [
    "from decimal import Decimal",
    "from uuid import UUID",
    "from app.database import SessionLocal",
    "from app.models import Employee, Item, DepartmentEnum, RequestBucketEnum, StockRequestTypeEnum",
    "from app.services.stock_requests import LineInput, create_request",
    "db = SessionLocal()",
    "try:",
    "    child = db.query(Item).filter(Item.process_type_code=='TR').first()",
    `    actor = db.query(Employee).filter(Employee.employee_id==UUID('${warehouseEmployee.employee_id}')).one()`,
    "    create_request(",
    "        db, requester=actor, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,",
    "        lines_input=[LineInput(item_id=child.item_id, quantity=Decimal('50'),",
    "            from_bucket=RequestBucketEnum.WAREHOUSE, from_department=None, to_bucket=RequestBucketEnum.PRODUCTION,",
    "            to_department=DepartmentEnum.TUBE)],",
    "        reference_no='e2e-global-setup', notes='e2e department stock seed',",
    "        client_request_id='e2e-global-setup-dept-stock',",
    "    )",
    "    db.commit()",
    "finally:",
    "    db.close()",
  ].join("\n");
  const dept = spawnSync("python", ["-c", seedPy], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL },
    encoding: "utf-8",
  });
  if (dept.status !== 0) {
    throw new Error(`부서 생산재고 시드 실패\n${dept.stdout}\n${dept.stderr}`);
  }

  // Playwright의 테스트별 새 browser context는 격리하되, production 발급 예산을 소모하지 않도록
  // setup에서 실제 발급한 HttpOnly capability를 employee_id별로 복제해 사용한다.
  const operatorAuth: Record<string, StoredCookie> = {
    [plainBase.employee_id]: await readOperatorCookie(context),
  };
  for (const employeeId of [whBase.employee_id, deptBase.employee_id]) {
    if (!operatorAuth[employeeId]) {
      operatorAuth[employeeId] = await issueReusableOperatorCookie(employeeId);
    }
  }

  fs.writeFileSync(
    SEED_FILE,
    JSON.stringify(
      {
        rawItem,
        parentItem,
        shippingPaItem,
        shippingItem,
        warehouseEmployee,
        departmentEmployee,
        plainEmployee,
        defaultPinEmployee: defaultPinBase,
        operatorPin: OPERATOR_PIN,
        operatorAuth,
      },
      null,
      2,
    ),
  );
  console.log(
    `[e2e:setup] seed 완료 — raw=${rawItem.mes_code} parent=${parentItem.mes_code} shipping=${shippingItem.mes_code} ` +
      `wh=${warehouseEmployee?.employee_code}(${warehouseEmployee?.warehouse_role}) ` +
      `dept=${departmentEmployee?.employee_code}(${departmentEmployee?.department_role})`,
  );
}

export default async function globalSetup() {
  const runToken = process.env.DEXCOWIN_E2E_RUN_TOKEN;
  if (!runToken) {
    throw new Error("E2E runner ownership is required");
  }
  assertE2eRunOwnership({ lockDir: LOCK_DIR, runToken });
  assertSetupArtifactsAbsent();

  // 인터프리터 해석 실패나 setup 직전 포트 점유는 산출물·DB 변경 전에 안전 종료한다.
  const PYTHON_EXECUTABLE = await prepareOwnedBackendPreflight({
    backendPort: BACKEND_PORT,
    markSafeAbort: () => {
      markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "safe-abort" });
    },
  });

  const protectedDbFamily = snapshotFileFamily(REAL_DB);
  const runNonce = runToken;
  let backend: ReturnType<typeof spawn> | undefined;
  let processReceipt: { pid: number; startToken: string; runNonce: string } | undefined;
  let mutationStarted = false;
  try {
    markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "setup-mutating" });
    mutationStarted = true;
    fs.writeFileSync(HASH_FILE, JSON.stringify(protectedDbFamily, null, 2));
    console.log("[e2e:setup] 실 mes.db/-wal/-shm 상태 기록");
    console.log(`[e2e:setup] bootstrap_db.py --all → ${DATABASE_URL}`);
    const boot = spawnSync(PYTHON_EXECUTABLE, ["bootstrap_db.py", "--all"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL },
      encoding: "utf-8",
    });
    if (boot.status !== 0) {
      throw new Error(`bootstrap 실패(code ${boot.status})\n${boot.stdout}\n${boot.stderr}`);
    }

    backend = spawn(
      PYTHON_EXECUTABLE,
      ["-m", "uvicorn", "scripts.e2e_app:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT), "--workers", "1", "--no-proxy-headers"],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env, DATABASE_URL, E2E_RUN_NONCE: runNonce },
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      },
    );
    if (!backend.pid) throw new Error("E2E 전용 백엔드 PID를 받지 못했습니다.");

    const startToken = readProcessStartToken(backend.pid);
    if (startToken === null) {
      throw new Error("E2E 전용 백엔드가 process receipt 기록 전에 종료되었습니다.");
    }
    processReceipt = { pid: backend.pid, startToken, runNonce };
    fs.writeFileSync(
      PROCESS_RECEIPT_FILE,
      JSON.stringify({ version: 2, ...processReceipt, backendUrl: BACKEND_URL, databaseUrl: DATABASE_URL }, null, 2),
    );
    backend.unref();
    console.log(`[e2e:setup] 백엔드 기동(pid ${backend.pid}) — 헬스 대기`);
    await waitForOwnedBackendReady({
      backendUrl: BACKEND_URL,
      expectedNonce: runNonce,
      expectedPid: backend.pid,
      timeoutMs: 30_000,
      getExitCode: () => backend?.exitCode ?? null,
    });

    const apiContext = await request.newContext({ baseURL: BACKEND_URL });
    try {
      await seed(apiContext);
    } finally {
      await apiContext.dispose();
    }
    markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "setup-ready" });
  } catch (error) {
    if (!mutationStarted) {
      markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "safe-abort" });
      throw error;
    }
    try {
      if (processReceipt) {
        await cleanupCapturedE2eRun({
          runToken,
          receipt: processReceipt,
          protectedDbFamily,
        });
      } else if (backend) {
        // identity receipt 전에는 직접 생성한 ChildProcess handle만 종료한다.
        await stopSpawnedChildHandle(backend);
        assertFileFamilyUnchanged(protectedDbFamily, snapshotFileFamily(REAL_DB));
        rmDbFamily(E2E_DB);
        fs.rmSync(PROCESS_RECEIPT_FILE, { force: true });
        fs.rmSync(HASH_FILE, { force: true });
        fs.rmSync(SEED_FILE, { force: true });
        markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "cleanup-complete" });
      } else {
        assertFileFamilyUnchanged(protectedDbFamily, snapshotFileFamily(REAL_DB));
        rmDbFamily(E2E_DB);
        fs.rmSync(PROCESS_RECEIPT_FILE, { force: true });
        fs.rmSync(HASH_FILE, { force: true });
        fs.rmSync(SEED_FILE, { force: true });
        markE2eRunPhase({ lockDir: LOCK_DIR, runToken, phase: "cleanup-complete" });
      }
    } catch (cleanupError) {
      // 살아 있을 수 있는 프로세스의 DB와 ownership 증거를 보존한다.
      throw new AggregateError(
        [error, cleanupError],
        "E2E setup 실패 후 소유 프로세스 종료를 증명하지 못했습니다.",
      );
    }
    throw error;
  }
  console.log("[e2e:setup] 완료");
  if (!processReceipt) {
    throw new Error("E2E setup 완료 후 captured process receipt가 없습니다.");
  }
  const capturedReceipt = processReceipt;
  return async () => cleanupCapturedE2eRun({
    runToken,
    receipt: capturedReceipt,
    protectedDbFamily,
  });
}
