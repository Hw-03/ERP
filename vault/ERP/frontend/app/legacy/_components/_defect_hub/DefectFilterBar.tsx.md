---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DefectFilterBar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectFilterBar.tsx — DefectFilterBar.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectFilterBar.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectFilterBar`
- `RadioOption`
- `DefectScope`
- `DefectSort`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type DefectScope = "my" | "production" | "all";
export type DefectSort = "oldest" | "newest";

const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

interface Props {
  scope: DefectScope;
  sort: DefectSort;
  onScopeChange: (scope: DefectScope) => void;
  onSortChange: (sort: DefectSort) => void;
  currentDept: string;
}

export function DefectFilterBar({
  scope,
  sort,
  onScopeChange,
  onSortChange,
  currentDept,
}: Props) {
  const isProductionLine = PRODUCTION_LINES.has(currentDept);

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-[14px] border px-4 py-3"
      style={{
        background: LEGACY_COLORS.s2,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      {/* 부서 범위 라디오 */}
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
          부서
        </span>
        <RadioOption
          id="scope-my"
          label="내 부서"
          checked={scope === "my"}
          disabled={!isProductionLine}
          onChange={() => onScopeChange("my")}
        />
        <RadioOption
          id="scope-production"
          label="생산부 라인 전체"
          checked={scope === "production"}
          onChange={() => onScopeChange("production")}
        />
        <RadioOption
          id="scope-all"
          label="전체"
```
