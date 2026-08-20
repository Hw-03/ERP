/**
 * Playwright globalSetup — e2e 전용 DB + 전용 백엔드 + 시드.
 *
 * 가드레일: 실 backend/mes.db 는 절대 건드리지 않는다.
 *  - 전용 DB: backend/mes_e2e.db (teardown 에서 삭제)
 *  - 전용 백엔드 포트 8021 / 전용 프론트 포트 3100 (dev 8011·3001, prod 8010·3000 과 무충돌)
 *  - setup 시작 시 실 mes.db SHA256 기록 → teardown 에서 불변 검증
 *
 * 흐름:
 *  1) 실 mes.db 해시 기록
 *  2) mes_e2e.db* 삭제 → bootstrap_db.py --all (DATABASE_URL=전용DB)
 *  3) uvicorn 전용 백엔드 기동(포트 8021) → /health/live 폴링
 *  4) API 시드(품목/BOM/직원 확보) → .e2e-seed.json 저장
 * 프론트(custom Next server, 3100)는 playwright.config webServer 가 BACKEND_INTERNAL_URL 로 8021 에 프록시.
 */
import { spawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { request, type APIRequestContext } from "@playwright/test";
import { assertSupportedNodeVersion } from "../../scripts/require-node-20.cjs";

assertSupportedNodeVersion(process.version);

const HERE = __dirname; // frontend/tests/e2e
const REPO_ROOT = path.resolve(HERE, "..", "..", ".."); // c:\ERP
const BACKEND_DIR = path.join(REPO_ROOT, "backend");
const REAL_DB = path.join(BACKEND_DIR, "mes.db");
const E2E_DB = path.join(BACKEND_DIR, "mes_e2e.db");
const DATABASE_URL = `sqlite:///${E2E_DB.split(path.sep).join("/")}`;

const BACKEND_PORT = 8021;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const OPERATOR_PIN = process.env.E2E_OPERATOR_PIN ?? "2468";
const OPERATOR_SESSION_COOKIE = "dexcowin_operator_session";

const PID_FILE = path.join(HERE, ".e2e-backend.pid");
const HASH_FILE = path.join(HERE, ".e2e-realdb-hash");
const SEED_FILE = path.join(HERE, ".e2e-seed.json");

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function rmDbFamily(base: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = base + suffix;
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
}

async function waitForHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/health/live`);
      if (r.ok) return;
    } catch {
      /* 아직 안 뜸 */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`전용 백엔드(${url}) 가 ${timeoutMs}ms 안에 헬스 그린이 되지 않음`);
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
  // 1) 실 mes.db 해시 기록(teardown 불변 검증용)
  if (fs.existsSync(REAL_DB)) {
    fs.writeFileSync(HASH_FILE, sha256(REAL_DB));
    console.log("[e2e:setup] 실 mes.db 해시 기록");
  } else {
    fs.rmSync(HASH_FILE, { force: true });
    console.log("[e2e:setup] 실 mes.db 없음(해시 가드 생략)");
  }

  // 2) 전용 DB 초기화 + bootstrap
  rmDbFamily(E2E_DB);
  console.log(`[e2e:setup] bootstrap_db.py --all → ${DATABASE_URL}`);
  const boot = spawnSync("python", ["bootstrap_db.py", "--all"], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL },
    encoding: "utf-8",
  });
  if (boot.status !== 0) {
    throw new Error(`bootstrap 실패(code ${boot.status})\n${boot.stdout}\n${boot.stderr}`);
  }

  // 3) 전용 백엔드 기동(포트 8021, --reload 없음 → 단일 프로세스)
  const backend = spawn(
    "python",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT), "--workers", "1", "--no-proxy-headers"],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL },
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    },
  );
  backend.unref();
  if (backend.pid) fs.writeFileSync(PID_FILE, String(backend.pid));
  console.log(`[e2e:setup] 백엔드 기동(pid ${backend.pid}) — 헬스 대기`);
  await waitForHealth(BACKEND_URL, 30_000);

  // 4) 시드
  const apiContext = await request.newContext({ baseURL: BACKEND_URL });
  try {
    await seed(apiContext);
  } finally {
    await apiContext.dispose();
  }
  console.log("[e2e:setup] 완료");
}
