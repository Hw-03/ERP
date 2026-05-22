---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DefectQuickActions.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectQuickActions.tsx — DefectQuickActions.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectQuickActions.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectQuickActions`
- `ActionButton`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  onAddQuarantine: () => void;
  onAddRReturn: () => void;
  onAddRScrap: () => void;
}

export function DefectQuickActions({ onAddQuarantine, onAddRReturn, onAddRScrap }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        label="+ 새 격리 추가"
        tone={LEGACY_COLORS.red}
        onClick={onAddQuarantine}
      />
      <ActionButton
        label="+ R 바로 반품"
        tone={LEGACY_COLORS.yellow}
        onClick={onAddRReturn}
      />
      <ActionButton
        label="+ R 바로 폐기"
        tone={LEGACY_COLORS.purple}
        onClick={onAddRScrap}
      />
    </div>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[12px] border px-4 py-2 text-sm font-black transition-colors hover:brightness-110"
      style={{
        background: tint(tone, 8),
        borderColor: tint(tone, 40),
        color: tone,
      }}
    >
      {label}
    </button>
```
