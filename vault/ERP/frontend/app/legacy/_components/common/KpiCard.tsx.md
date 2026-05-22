---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/KpiCard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# KpiCard.tsx — KpiCard.tsx 설명

## 이 파일은 무엇을 책임지나

`KpiCard.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `KpiCardImpl`
- `KpiCard`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo, useState } from "react";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

function KpiCardImpl({ label, value, hint, tone, active = false, onClick, compact = false }: Props) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? tint(tone, 22)
    : hovered
    ? tint(tone, 16)
    : tint(tone, 8);
  const border = active || hovered ? tone : tint(tone, 35);

  const boxCls = compact
    ? "rounded-[12px] border px-4 py-2.5"
    : "rounded-[16px] border px-3 py-3 lg:px-5 lg:py-5";

  const content = compact ? (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div
          className="truncate text-[22px] font-black leading-tight tracking-[-0.02em]"
          style={{ color: tone }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="truncate text-[12px] font-semibold leading-tight"
            style={{ color: tone, opacity: 0.7 }}
          >
            {hint}
          </div>
        )}
      </div>
      <div
        className="-mt-1 shrink-0 text-[32px] font-black leading-none"
        style={{ color: tone }}
      >
        {value}
      </div>
    </div>
  ) : (
```
