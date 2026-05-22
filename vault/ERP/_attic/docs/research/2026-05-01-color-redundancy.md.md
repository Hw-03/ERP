---
type: file-explanation
source_path: "_attic/docs/research/2026-05-01-color-redundancy.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-01-color-redundancy.md — 2026-05-01-color-redundancy.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-01-color-redundancy.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `부서 색상 5개 산재 위치 매핑 — 2026-05-01`
- `1. 5개 산재 위치 상세`
- `위치 1 — `legacyUi.ts::employeeColor()``
- `위치 2 — `DepartmentsContext.tsx::getColor()``
- `위치 3 — `useAdminDepartments.ts::COLOR_PALETTE` + `pickAutoColor()``
- `위치 4 — `historyShared.ts::PROCESS_TYPE_META``
- `위치 5 — `adminShared.ts::bomCategoryColor()``
- `2. 사용처 종합표`
- `3. 핵심 문제 정리`
- `4. 통합 설계안 (계획만, 실제 생성은 회사 PC)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
