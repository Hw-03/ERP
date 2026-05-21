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
    case "연구": return "#b45309";  // amber-700
    case "영업": return "#b91c1c";  // red-700
    case "출하": return "#0f766e";  // teal-700
    case "튜브": return "#4d7c0f";  // lime-700
    default:    return "#475569";  // slate-600
  }
}
```

**역할:** 부서명 → hex 정적 매핑. DB 없이 동작하는 폴백.  
**사용처:** `DepartmentsContext.tsx:56`, `_admin_sections/AdminDepartmentsSection.tsx:10`, `useAdminDepartments.ts:6`

---

### 위치 2 — `DepartmentsContext.tsx::getColor()`

**파일:** `frontend/app/legacy/_components/DepartmentsContext.tsx:48`

```ts
const getColor = useMemo(() => {
  const byName = new Map<string, string>();
  departments.forEach(d => {
    if (d.color_hex) byName.set(d.name, d.color_hex);  // DB 우선
  });
  return (name?: string | null) => {
    if (!name) return employeeColor(name);
    const normalized = normalizeDepartment(name);
    return byName.get(name) ?? byName.get(normalized) ?? employeeColor(name);  // fallback
  };
}, [departments]);
```

**역할:** DB `color_hex` 우선, 없으면 `employeeColor()` 폴백.  
**사용처:** Context 전역 — 컴포넌트가 `useDepartmentColor(name)` 훅으로 호출  
**특징:** ✅ DB-first. 가장 권장되는 패턴.

---

### 위치 3 — `useAdminDepartments.ts::COLOR_PALETTE` + `pickAutoColor()`

**파일:** `frontend/app/legacy/_components/_admin_hooks/useAdminDepartments.ts:9,35`

```ts
export const COLOR_PALETTE = [
  "#1d4ed8", "#c2410c", "#6d28d9", "#0e7490",
  "#be185d", "#b45309", "#0f766e", "#4d7c0f",
  "#9333ea", "#0284c7", "#dc2626", "#059669",
];
```

**역할:** 신규 부서 생성 시 미사용 색상 자동 배정.  
**핵심 문제:** `COLOR_PALETTE` 첫 8개가 `employeeColor()` 반환값과 **동일한 hex**. 두 소스가 독립적으로 정의됨.

```
employeeColor 조립 → #1d4ed8  |  COLOR_PALETTE[0] → #1d4ed8  ← 동일!
employeeColor 고압 → #c2410c  |  COLOR_PALETTE[1] → #c2410c  ← 동일!
employeeColor 진공 → #6d28d9  |  COLOR_PALETTE[2] → #6d28d9  ← 동일!
... (8개 전부 일치)
```

---

### 위치 4 — `historyShared.ts::PROCESS_TYPE_META`

**파일:** `frontend/app/legacy/_components/_history_sections/historyShared.ts:23`

```ts
export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: { label: "튜브 원자재", color: LEGACY_COLORS.cyan, ... },
  HR: { label: "고압 원자재", color: LEGACY_COLORS.yellow, ... },
  VR: { label: "진공 원자재", color: LEGACY_COLORS.purple, ... },
  NR: { label: "튜닝 원자재", color: "#f97316", ... },   // ← 하드코딩
  AR: { label: "조립 원자재", color: "#818cf8", ... },   // ← 하드코딩
  PR: { label: "출하 원자재", color: LEGACY_COLORS.green, ... },
  // ... 18개 (TR/TA/TF/HR/HA/HF/VR/VA/VF/NR/NA/NF/AR/AA/AF/PR/PA/PF)
};
```

**역할:** 공정 타입 코드(예: `HR`, `VF`) → 라벨/색상 매핑.  
**특징:** 부서 색상과 다른 체계이지만 같은 색상 팔레트 참조. `LEGACY_COLORS.*` + 일부 하드코딩 혼재.  
**참고:** 이는 "부서 색상"이 아니라 "공정 타입 색상"이지만 색상 값 겹침으로 인해 통합 후보에 포함됨.

---

### 위치 5 — `adminShared.ts::bomCategoryColor()`

**파일:** `frontend/app/legacy/_components/_admin_sections/adminShared.ts:61`

```ts
export function bomCategoryColor(code?: string | null): string {
  if (!code) return "var(--c-muted2)";
  const prefix = code[0] ?? "";
  if (prefix === "T") return "var(--c-cyan)";
  if (prefix === "H") return "var(--c-yellow)";
  if (prefix === "V") return "var(--c-purple)";
  if (prefix === "N") return "#f97316";          // ← CSS var 아닌 하드코딩
  if (prefix === "A") return "var(--c-blue)";
  if (prefix === "P") return "var(--c-green)";
  return "var(--c-muted2)";
}
```

**역할:** BOM 카테고리 첫 글자(T/H/V/N/A/P) → 색상.  
**특징:** CSS 변수(`var(--c-*)`) 사용 — 다크모드 대응 면에서 가장 좋은 패턴. `#f97316`만 하드코딩.

---

## 2. 사용처 종합표

| 색상 소스 | import 하는 파일 |
|---|---|
| `legacyUi.ts::employeeColor` | `DepartmentsContext.tsx`, `AdminDepartmentsSection.tsx`, `useAdminDepartments.ts`, `DesktopInventoryView.tsx`, `ItemDetailSheet.tsx`, `SelectedItemsPanel.tsx`, `InventoryItemRow.tsx`, `mobile/primitives/ItemRow.tsx` |
| `DepartmentsContext::getColor` | `useDepartmentColor()` 훅 → 전체 컴포넌트 |
| `useAdminDepartments::COLOR_PALETTE` | `useAdminDepartments.ts` 내부만 |
| `historyShared::PROCESS_TYPE_META` | `HistoryLogRow.tsx`, `HistoryDetailPanel.tsx` |
| `adminShared::bomCategoryColor` | `AdminBomSection.tsx` |

---

## 3. 핵심 문제 정리

| # | 문제 | 영향 |
|---|---|---|
| P-1 | `employeeColor()`와 `COLOR_PALETTE` 첫 8개 hex 중복 정의 | 부서 색상 변경 시 두 곳 모두 수정 필요 |
| P-2 | `PROCESS_TYPE_META`의 `#f97316`, `#818cf8` 하드코딩 | CSS 변수 체계와 불일치, 다크모드 대응 안 됨 |
| P-3 | `bomCategoryColor()`의 `#f97316` 하드코딩 | 위 동일 |
| P-4 | DB `color_hex`가 있어도 일부 컴포넌트는 `employeeColor()` 직접 참조 | DB 색상 변경이 반영 안 될 수 있음 |
| P-5 | CSS var(`var(--c-*)`) vs hex 혼재 | 다크모드 일관성 없음 |

---

## 4. 통합 설계안 (계획만, 실제 생성은 회사 PC)

### 권장 파일: `frontend/lib/mes-department.ts` (신규)

```ts
// 부서 색상 단일 소스 (DB color_hex 우선 원칙은 DepartmentsContext에서 처리)

export const DEPT_COLOR_PALETTE = [
  "#1d4ed8", // 조립 / blue-700
  "#c2410c", // 고압 / orange-700
  "#6d28d9", // 진공 / violet-700
  "#0e7490", // 튜닝 / cyan-700
  "#be185d", // 서비스/AS / pink-700
  "#b45309", // 연구 / amber-700
  "#0f766e", // 출하 / teal-700
  "#4d7c0f", // 튜브 / lime-700
  "#9333ea", "#0284c7", "#dc2626", "#059669",   // 확장용
] as const;

// 부서명 → 인덱스 (고정 매핑)
const DEPT_INDEX: Record<string, number> = {
  "조립": 0, "고압": 1, "진공": 2, "튜닝": 3,
  "서비스": 4, "AS": 4, "연구": 5, "영업": 6,
  "출하": 6, "튜브": 7,
};

export function getDeptColor(name?: string | null): string {
  if (!name) return "#475569";
  const idx = DEPT_INDEX[name] ?? -1;
  return idx >= 0 ? DEPT_COLOR_PALETTE[idx]! : "#475569";
}

export function pickNewDeptColor(usedHexes: string[]): string {
  // pickAutoColor 로직 이관
}

// 공정 타입별 색상 (LEGACY_COLORS 대체)
export const PROCESS_TYPE_COLORS: Record<string, string> = {
  T: "var(--c-cyan)",
  H: "var(--c-yellow)",
  V: "var(--c-purple)",
  N: "var(--c-orange)",  // #f97316 → CSS var로 통일
  A: "var(--c-blue)",
  P: "var(--c-green)",
};
```

### 마이그레이션 순서

1. `mes-department.ts` 신규 생성
2. `legacyUi.ts::employeeColor()` → `getDeptColor()` 위임 (내부 구현만 교체, export 유지)
3. `useAdminDepartments.ts::COLOR_PALETTE` → `DEPT_COLOR_PALETTE` import로 교체
4. `historyShared.ts::PROCESS_TYPE_META` → `PROCESS_TYPE_COLORS` 참조로 교체
5. `adminShared.ts::bomCategoryColor()` → `PROCESS_TYPE_COLORS` 참조로 교체
6. `DepartmentsContext.tsx` — 이미 DB-first 패턴이므로 fallback만 교체

**위험도:** C (서버 확인 필요) — 회사 PC에서 진행  
**모바일 가능:** 계획/설계만

---

## 5. 다음 작업

- `MES-COMP-002` (토요일) — StatusPill/StatusBadge Tone 매핑 통합 설계  
- `MES-COMP-001` 실행 — `mes-department.ts` 실제 생성 (C등급, 회사 PC)
