/**
 * 모바일 평가 스크립트 공용 — 작업자 세션 시딩.
 *
 * 앱은 localStorage 의 작업자 정보(`dexcowin_erp_operator`)가 없으면 로그인
 * 게이트만 렌더한다. 평가(스크린샷/a11y)는 실제 화면을 봐야 하므로,
 * 페이지 로드 전에 백엔드의 실제 직원/boot_id 를 가져와 localStorage 에
 * 주입한다(ErpLoginGate 의 boot_id 검증 통과용).
 */

const OPERATOR_KEY = "dexcowin_erp_operator";
const BOOT_KEY = "dexcowin_erp_boot_id";

/** 모든 탭 도달을 위해 창고 권한(primary>deputy) 우선, 그 다음 admin 레벨 */
function pickOperator(employees) {
  const active = employees.filter((e) => e.is_active !== false);
  const pool = active.length ? active : employees;
  const score = (e) =>
    (e.warehouse_role === "primary" ? 100 : e.warehouse_role === "deputy" ? 60 : 0) +
    (e.level === "admin" ? 20 : e.level === "manager" ? 10 : 0) +
    (e.department_role !== "none" ? 5 : 0);
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

function toOperator(e) {
  return {
    employee_id: e.employee_id,
    name: e.name,
    department: e.department,
    level: e.level,
    employee_code: e.employee_code,
    warehouse_role: e.warehouse_role ?? "none",
    department_role: e.department_role ?? "none",
    theme: e.theme ?? null,
    assigned_model_slots: Array.isArray(e.assigned_model_slots)
      ? e.assigned_model_slots
      : [],
  };
}

/**
 * playwright BrowserContext 에 작업자 세션을 주입한다.
 * @returns 선택된 operator (로그용) 또는 null(실패 시 — 로그인 화면 평가로 폴백)
 */
export async function seedOperator(context, baseUrl) {
  try {
    const [sessionRes, empRes] = await Promise.all([
      fetch(`${baseUrl}/api/app-session`),
      fetch(`${baseUrl}/api/employees`),
    ]);
    if (!sessionRes.ok || !empRes.ok) {
      console.warn(
        `  ⚠️  세션 시딩 실패(app-session ${sessionRes.status} / employees ${empRes.status}) — 로그인 화면으로 평가`,
      );
      return null;
    }
    const session = await sessionRes.json();
    const employees = await empRes.json();
    const list = Array.isArray(employees)
      ? employees
      : employees.items || employees.employees || [];
    if (!list.length) {
      console.warn("  ⚠️  직원 목록 비어있음 — 로그인 화면으로 평가");
      return null;
    }
    const operator = toOperator(pickOperator(list));
    await context.addInitScript(
      ([opKey, bootKey, op, bootId]) => {
        try {
          window.localStorage.setItem(opKey, JSON.stringify(op));
          window.localStorage.setItem(bootKey, bootId);
        } catch {
          /* localStorage 불가 환경 무시 */
        }
      },
      [OPERATOR_KEY, BOOT_KEY, operator, session.boot_id],
    );
    return operator;
  } catch (err) {
    console.warn(`  ⚠️  세션 시딩 예외: ${err.message} — 로그인 화면으로 평가`);
    return null;
  }
}
