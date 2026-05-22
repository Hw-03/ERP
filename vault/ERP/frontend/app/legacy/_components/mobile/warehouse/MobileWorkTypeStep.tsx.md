---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/warehouse/MobileWorkTypeStep.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileWorkTypeStep.tsx — MobileWorkTypeStep.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileWorkTypeStep.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileWorkTypeStep`
- `MobileSubTypeStep`
- `Label`
- `DeptGrid`
- `DeptIoDirection`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/warehouse/📁_warehouse]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "../../_warehouse_v2/types";
import {
  IO_SUB_TYPES,
  IO_WORK_TYPES,
  canSeeWorkType,
  deptVisibility,
  isExitWorkType,
  requiresDepartments,
  type DeptIoDirection,
} from "../../_warehouse_v2/ioWorkType";

const PROD_DEPTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"];

/**
 * Step 1 (모바일) — 작업 유형 선택.
 *
 * 데스크탑 IoWorkTypeStep 은 p-10/text-4xl/h-full grid 라 393px 에서 글자가
 * 세로로 깨지고 카드가 잘린다. 데이터/권한 로직(IO_WORK_TYPES/canSeeWorkType)은
 * 그대로 재사용하고 레이아웃만 모바일 1열 카드로 다시 그린다.
 */
export function MobileWorkTypeStep({
  workType,
  operator,
  onWorkTypeChange,
}: {
  workType: IoWorkType;
  operator: OperatorLike | null;
  onWorkTypeChange: (workType: IoWorkType) => void;
}) {
  const visible = IO_WORK_TYPES.filter((row) => canSeeWorkType(row.id, operator));
  return (
    <div className="flex flex-col gap-2.5">
      {visible.map((row) => {
        const Icon = row.icon;
        const active = workType === row.id;
        const accent = isExitWorkType(row.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        // 활성 카드 텍스트: 연한 틴트 위 brand 색은 AA 미달 → text 색과 섞어 어둡게
        const accentText = `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})`;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={active}
            onClick={() => onWorkTypeChange(row.id)}
            className="flex min-h-[72px] items-center gap-4 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
            style={{
              background: active ? tint(accent, 14) : LEGACY_COLORS.s2,
              borderColor: active ? accent : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? accentText : LEGACY_COLORS.text,
```
