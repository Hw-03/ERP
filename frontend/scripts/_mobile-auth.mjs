/**
 * 모바일 평가 스크립트 공용 — 작업자 세션 시딩.
 *
 * 평가 브라우저와 cookie jar를 공유하는 APIRequestContext로 실제 작업자
 * 세션을 만든다. PIN은 MES_OPERATOR_PIN 환경 변수(기본 0000)를 사용하며,
 * 최초 PIN 변경이 필요한 계정은 DB를 자동 변경하지 않고 로그인 화면으로 폴백한다.
 */

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
    const empRes = await context.request.get(`${baseUrl}/api/employees`);
    if (!empRes.ok()) {
      console.warn(
        `  ⚠️  세션 시딩 실패(employees ${empRes.status()}) — 로그인 화면으로 평가`,
      );
      return null;
    }
    const employees = await empRes.json();
    const list = Array.isArray(employees)
      ? employees
      : employees.items || employees.employees || [];
    if (!list.length) {
      console.warn("  ⚠️  직원 목록 비어있음 — 로그인 화면으로 평가");
      return null;
    }
    const employee = pickOperator(list);
    const login = await context.request.post(`${baseUrl}/api/operator-session`, {
      data: {
        employee_id: employee.employee_id,
        pin: process.env.MES_OPERATOR_PIN ?? "0000",
      },
    });
    if (!login.ok()) {
      console.warn(`  ⚠️  작업자 로그인 실패(${login.status()}) — 로그인 화면으로 평가`);
      return null;
    }
    const session = await login.json();
    return toOperator(session.employee);
  } catch (err) {
    console.warn(`  ⚠️  세션 시딩 예외: ${err.message} — 로그인 화면으로 평가`);
    return null;
  }
}
