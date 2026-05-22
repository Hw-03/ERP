---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/bomDept.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bomDept.ts — bomDept.ts 설명

## 이 파일은 무엇을 책임지나

`bomDept.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `deptOf`
- `stageOf`
- `deptColor`
- `deptLabel`
- `deptBadgeBg`
- `bomStatusOf`
- `DEPT_LETTERS`
- `DEPT_LETTER_TO_NAME`
- `STAGE_LABEL`
- `BOM_STATUS_META`
- 그 외 3개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * BOM Workbench 부서/단계 유틸 — process_type_code 기반.
 *
 * process_type_code 형식: 두 글자 (예: "TR", "HA", "AF").
 *   - 첫 글자  = 부서 (T/H/V/N/A/P)
 *   - 두 번째 = 단계 (R=원자재, A=중간공정, F=공정완료)
 *
 * 색상은 `@/lib/mes-department` 의 fallback 시스템을 사용 — DB color_hex 가
 * 우선이지만 본 도구는 정적 매핑(부서명 → fallback)만으로 충분.
 */
import { getDepartmentFallbackColor } from "@/lib/mes-department";
import { LEGACY_COLORS } from "@/lib/mes/color";

export const DEPT_LETTERS = ["T", "H", "V", "N", "A", "P"] as const;
export type DeptLetter = (typeof DEPT_LETTERS)[number];

export const DEPT_LETTER_TO_NAME: Record<DeptLetter, string> = {
  T: "튜브",
  H: "고압",
  V: "진공",
  N: "튜닝",
  A: "조립",
  P: "출하",
};

export type StageLetter = "R" | "A" | "F";

export const STAGE_LABEL: Record<StageLetter, string> = {
  R: "원자재",
  A: "중간공정",
  F: "공정완료",
};

/** process_type_code → 부서 letter (첫 글자). 매핑되지 않으면 null. */
export function deptOf(pt: string | null | undefined): DeptLetter | null {
  const c = pt?.[0];
  return c && (DEPT_LETTERS as readonly string[]).includes(c) ? (c as DeptLetter) : null;
}

/** process_type_code → 단계 letter (두 번째 글자). */
export function stageOf(pt: string | null | undefined): StageLetter | null {
  const c = pt?.[1];
  if (c === "R" || c === "A" || c === "F") return c;
  return null;
}

/** 부서 letter → 색상 (DB color_hex 없을 때의 fallback). */
export function deptColor(letter: DeptLetter): string {
  return getDepartmentFallbackColor(DEPT_LETTER_TO_NAME[letter]);
}

/** 부서 letter → 한글 라벨. */
export function deptLabel(letter: DeptLetter): string {
  return DEPT_LETTER_TO_NAME[letter];
}
```
