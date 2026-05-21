---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-01-color-redundancy.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-01-color-redundancy.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-01-color-redundancy.md]]

## 원본 첫 줄 (또는 메타)

```
# 부서 색상 5개 산재 위치 매핑 — 2026-05-01

> **작업 ID:** MES-COMP-001  
> **작성일:** 2026-05-01 (금)  
> **기준 브랜치:** `feat/hardening-roadmap`  
> (초기 분석은 `claude/analyze-dexcowin-mes-tGZNI` 에서 시작했으나 fast-forward 머지 후 통일. 이 브랜치는 폐기됨.)  
> **수정 여부:** 없음 (읽기 전용 분석 + 통합 설계 계획)

---

## 1. 5개 산재 위치 상세

### 위치 1 — `legacyUi.ts::employeeColor()`

**파일:** `frontend/app/legacy/_components/legacyUi.ts:61`

```ts
export function employeeColor(value?: string | null) {
  switch (normalizeDepartment(value)) {
    case "조립": return "#1d4ed8";  // blue-700
    case "고압": return "#c2410c";  // orange-700
    case "진공": return "#6d28d9";  // violet-700
    case "튜닝": return "#0e7490";  // cyan-700
    case "서비스": return "#047857"; // emerald-700
    case "AS":  return "#be185d";  // pink-700
```
