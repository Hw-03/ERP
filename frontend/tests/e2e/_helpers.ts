/**
 * e2e 공용 헬퍼.
 *
 * loginAsOperator — globalSetup이 실제 발급한 HttpOnly cookie 세션을 새 browser context에 복제한다.
 * MesLoginGate는 이후 GET /api/operator-session 응답을 정본으로 화면 cache를 복원한다.
 */
import { expect, type Page } from "@playwright/test";

export interface OperatorLike {
  employee_id: string;
  name: string;
  department: string;
  level: string;
  employee_code: string;
  warehouse_role: string;
  department_role: string;
  theme: string | null;
  assigned_model_slots: number[];
}

interface StoredOperatorCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

interface E2ESeed {
  rawItem: any;
  parentItem: any;
  warehouseEmployee: any;
  departmentEmployee: any;
  plainEmployee: any;
  defaultPinEmployee: any;
  operatorPin: string;
  operatorAuth: Record<string, StoredOperatorCookie>;
}

function toOperator(emp: any): OperatorLike {
  return {
    employee_id: emp.employee_id,
    name: emp.name,
    department: emp.department,
    level: emp.level,
    employee_code: emp.employee_code,
    warehouse_role: emp.warehouse_role ?? "none",
    department_role: emp.department_role ?? "none",
    theme: emp.theme ?? null,
    assigned_model_slots: emp.assigned_model_slots ?? [],
  };
}

/**
 * 테스트별 browser context의 cookie jar에 setup이 실제 발급한 작업자 세션을 복제한다.
 * @param opts.role "warehouse" | "department" — globalSetup이 지정한 역할 직원 선택.
 * @param opts.code 특정 employee_code 직원으로 로그인(2-세션 결재 테스트용). role 보다 우선.
 */
export async function loginAsOperator(
  page: Page,
  opts: { role?: "warehouse" | "department"; code?: string } = {},
): Promise<OperatorLike> {
  const seed = readSeed();
  const preparedEmployees = [seed.warehouseEmployee, seed.departmentEmployee, seed.plainEmployee];
  const emp =
    (opts.code && preparedEmployees.find((employee) => employee.employee_code === opts.code)) ||
    (opts.role === "warehouse" && seed.warehouseEmployee) ||
    (opts.role === "department" && seed.departmentEmployee) ||
    (!opts.code && !opts.role && seed.plainEmployee);
  if (!emp) throw new Error("요청한 E2E 작업자의 준비된 세션이 없습니다 — globalSetup 시드 확인 필요");

  const authCookie = seed.operatorAuth[emp.employee_id];
  if (!authCookie || !authCookie.httpOnly || authCookie.name !== "dexcowin_operator_session") {
    throw new Error(`E2E 작업자 ${emp.employee_code}의 HttpOnly operator cookie가 없습니다.`);
  }

  await page.context().clearCookies({
    name: /^dexcowin_(operator_session|pin_change_challenge)$/,
  });
  await page.context().addCookies([authCookie]);

  const restored = await page.request.get("/api/operator-session");
  const body = await restored.text();
  expect(restored.status(), body).toBe(200);
  const session = JSON.parse(body) as { employee: any };
  expect(session.employee.employee_id).toBe(emp.employee_id);
  return toOperator(session.employee);
}

/**
 * 입출고 V2 작성(compose) 화면으로 진입하고 "작업 유형 선택" 단계를 기다린다.
 *
 * mes 페이지는 모바일/데스크톱을 CSS(lg:hidden)로 분기하므로 두 셸이 모두 DOM 에 존재한다.
 * ?tab=warehouse 딥링크에선 모바일 io 위저드의 "작업 유형 선택" h2 도 (숨김 상태로) 함께
 * 렌더돼 DOM 상 데스크톱 것보다 먼저 온다 → 단순 first() 는 숨은 모바일 요소를 잡아 실패.
 * 따라서 보이는(=현재 뷰포트의) 요소만 필터한다.
 */
export async function gotoWarehouseCompose(page: Page): Promise<void> {
  await page.goto("/mes?tab=warehouse");
  await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
}

/** 작업 유형 카드 클릭(원자재 입고 / 창고 입출고 / 부서 입출고). 반응형 숨김 중복 회피로 visible 필터. */
export async function pickWorkType(page: Page, label: RegExp): Promise<void> {
  await page.getByRole("button", { name: label }).filter({ visible: true }).first().click();
}

/**
 * Next app-router query-only step changes should wait on rendered UI, not load/navigation completion.
 */
export async function clickNextStep(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /다음 단계로/ })
    .filter({ visible: true })
    .first()
    .click({ noWaitAfter: true });
}

/** 품목 선택 단계에서 담긴 품목을 수량 확인 단계로 넘긴다. */
export async function advanceToQuantityStep(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /수량 조정/, disabled: false })
    .filter({ visible: true })
    .first()
    .click({ noWaitAfter: true });
  await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).first()).toBeVisible();
}

/** globalSetup 이 저장한 시드(.e2e-seed.json) 를 읽어 테스트에서 품목/직원 식별자에 접근. */
export function readSeed(): E2ESeed {
  // require 로 읽으면 Playwright 워커마다 캐시됨 — 정적 시드라 무방.
  return require("./.e2e-seed.json");
}
