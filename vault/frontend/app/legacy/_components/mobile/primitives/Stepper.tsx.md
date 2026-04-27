---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/Stepper.tsx
status: active
updated: 2026-04-27
source_sha: dcc8bb882b67
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# Stepper.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/Stepper.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2587` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  bigStep = 10,
  danger = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  danger?: boolean;
  className?: string;
}) {
  const clamp = (next: number) => {
    let v = next;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const color = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  return (
    <div className={clsx("flex items-stretch overflow-hidden rounded-[14px] border", className)} style={{ borderColor: LEGACY_COLORS.border }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - bigStep))}
        className={clsx("px-2 font-bold", TYPO.caption)}
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
        aria-label={`-${bigStep}`}
      >
        -{bigStep}
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-10 w-10 items-center justify-center"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        aria-label="감소"
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(clamp(Number.isNaN(n) ? 0 : n));
        }}
        className={clsx("w-16 border-x bg-transparent text-center font-black tabular-nums outline-none", TYPO.title)}
        style={{ borderColor: LEGACY_COLORS.border, color }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-10 w-10 items-center justify-center"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        aria-label="증가"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value + bigStep))}
        className={clsx("px-2 font-bold", TYPO.caption)}
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
        aria-label={`+${bigStep}`}
      >
        +{bigStep}
      </button>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
