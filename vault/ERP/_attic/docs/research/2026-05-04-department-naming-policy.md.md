---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-department-naming-policy.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-department-naming-policy.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-department-naming-policy.md]]

## 원본 첫 줄 (또는 메타)

```
# 부서명 정규화 정책 통일 가이드 — 2026-05-04

> **작업 ID:** R4-6 (보류 + 가이드)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 가이드만. 코드 변경 0.

---

## 1. 문제

`legacyUi.employeeColor` 를 `mes-department.getDepartmentFallbackColor` 의 wrapper 로 위임하려 했으나 (R4-6) 두 모듈의 부서명 정규화 정책이 충돌:

### legacyUi.normalizeDepartment

```ts
export const DEPARTMENT_LABELS: Record<string, string> = {
  "조립": "조립",
  ...
  "연구": "연구소",   // ← "연구" → "연구소" 변환
  ...
};

export function normalizeDepartment(value?: string | null) {
  if (!value) return "기타";
```
