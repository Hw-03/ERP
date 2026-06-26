/**
 * e2e 공용 헬퍼.
 *
 * loginAsOperator — MesLoginGate 우회. 게이트는 3중 검증을 하므로 고정값 inject 로는 부족하다:
 *   1) localStorage.dexcowin_mes_operator (employee_id·name 필수)
 *   2) localStorage.dexcowin_mes_boot_id == GET /api/app-session 의 boot_id
 *   3) employee_id ∈ GET /api/employees?active_only=true (실재 활성 직원)
 * → 런타임에 두 API 를 조회해 실재 직원 + 현재 boot_id 를 inject 한다.
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
 * 로그인 게이트를 통과하도록 localStorage 를 inject 한다. page.goto 전에 호출할 것.
 * @param opts.role "warehouse" | "department" — 해당 역할 primary(없으면 deputy) 직원 우선 선택.
 * @param opts.code 특정 employee_code 직원으로 로그인(2-세션 결재 테스트용). role 보다 우선.
 */
export async function loginAsOperator(
  page: Page,
  opts: { role?: "warehouse" | "department"; code?: string } = {},
): Promise<OperatorLike> {
  const session = await (await page.request.get("/api/app-session")).json();
  const emps: any[] = await (await page.request.get("/api/employees?active_only=true")).json();

  const roleKey =
    opts.role === "warehouse"
      ? "warehouse_role"
      : opts.role === "department"
        ? "department_role"
        : null;
  const emp =
    (opts.code && emps.find((e) => e.employee_code === opts.code)) ||
    (roleKey &&
      (emps.find((e) => e[roleKey] === "primary") || emps.find((e) => e[roleKey] === "deputy"))) ||
    emps[0];
  if (!emp) throw new Error("활성 직원이 없습니다 — globalSetup 시드 확인 필요");

  const op = toOperator(emp);
  await page.addInitScript(
    ([o, bootId]) => {
      localStorage.setItem("dexcowin_mes_operator", JSON.stringify(o));
      localStorage.setItem("dexcowin_mes_boot_id", bootId as string);
    },
    [op, session.boot_id] as [OperatorLike, string],
  );
  return op;
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
  await expect(page.getByText("작업 유형 선택").filter({ visible: true }).first()).toBeVisible();
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

/** globalSetup 이 저장한 시드(.e2e-seed.json) 를 읽어 테스트에서 품목/직원 식별자에 접근. */
export function readSeed(): {
  rawItem: any;
  parentItem: any;
  warehouseEmployee: any;
  departmentEmployee: any;
  plainEmployee: any;
} {
  // require 로 읽으면 Playwright 워커마다 캐시됨 — 정적 시드라 무방.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./.e2e-seed.json");
}
