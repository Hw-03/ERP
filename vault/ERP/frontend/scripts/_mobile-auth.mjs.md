---
type: file-explanation
source_path: "frontend/scripts/_mobile-auth.mjs"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _mobile-auth.mjs — _mobile-auth.mjs 설명

## 이 파일은 무엇을 책임지나

`_mobile-auth.mjs`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/_mobile-auth.mjs` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/scripts/📁_scripts]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```js
/**
 * 모바일 평가 스크립트 공용 — 작업자 세션 시딩.
 *
 * 앱은 localStorage 의 작업자 정보(`dexcowin_mes_operator`)가 없으면 로그인
 * 게이트만 렌더한다. 평가(스크린샷/a11y)는 실제 화면을 봐야 하므로,
 * 페이지 로드 전에 백엔드의 실제 직원/boot_id 를 가져와 localStorage 에
 * 주입한다(MesLoginGate 의 boot_id 검증 통과용).
 */

const OPERATOR_KEY = "dexcowin_mes_operator";
const BOOT_KEY = "dexcowin_mes_boot_id";

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
```
