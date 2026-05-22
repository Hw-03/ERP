---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/PinInput.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# PinInput.tsx — PinInput.tsx 설명

## 이 파일은 무엇을 책임지나

`PinInput.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PinInput`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

/**
 * 모바일 PIN 입력 — numeric password + tracking-[0.4em].
 * OperatorMenuSheet · ApprovalQueuePanel · HistoryDetailSheet 공통.
 */
export function PinInput({
  label,
  value,
  onChange,
  maxLength = 8,
  placeholder = "••••",
  className,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <span
          className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {label}
        </span>
      ) : null}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, maxLength))
        }
        className={clsx(
          TYPO.title,
          "rounded-[14px] border px-4 py-3 font-black tabular-nums tracking-[0.4em] outline-none",
        )}
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        placeholder={placeholder}
      />
    </label>
```
