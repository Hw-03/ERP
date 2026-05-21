---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/scripts/_mobile-auth.mjs
tags: [vault, code-note, auto-generated, stub]
---

# _mobile-auth.mjs

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/scripts/_mobile-auth.mjs]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
