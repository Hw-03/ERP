---
type: file-explanation
source_path: "frontend/app/legacy/_components/ItemDetailActionForm.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ItemDetailActionForm.tsx — ItemDetailActionForm.tsx 설명

## 이 파일은 무엇을 책임지나

`ItemDetailActionForm.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ItemDetailActionForm`
- `ItemDetailActionMode`
- `ItemDetailActionFormProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type ItemDetailActionMode = "ADJUST" | "RECEIVE";

/**
 * Round-13 (#14) 추출 — ItemDetailSheet 의 mode 선택 + 수량 입력 + 비고 + 제출 폼.
 */
export interface ItemDetailActionFormProps {
  mode: ItemDetailActionMode;
  qty: string;
  notes: string;
  error: string | null;
  saving: boolean;
  initialQuantity: number;
  setMode: (m: ItemDetailActionMode) => void;
  setQty: (v: string) => void;
  setNotes: (v: string) => void;
  bump: (delta: number) => void;
  onSubmit: () => void;
}

export function ItemDetailActionForm({
  mode,
  qty,
  notes,
  error,
  saving,
  initialQuantity,
  setMode,
  setQty,
  setNotes,
  bump,
  onSubmit,
}: ItemDetailActionFormProps) {
  return (
    <div className="mb-[14px] overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="flex gap-2 px-[14px] py-3">
        {[
          { id: "ADJUST", label: "조정" },
          { id: "RECEIVE", label: "입고" },
        ].map((action) => (
          <button
            key={action.id}
            onClick={() => {
              setMode(action.id as ItemDetailActionMode);
              setQty(action.id === "ADJUST" ? String(initialQuantity) : "1");
            }}
            className="flex-1 rounded-xl py-2 text-xs font-bold"
            style={{
              background: mode === action.id ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
              color: mode === action.id ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
            }}
          >
```
