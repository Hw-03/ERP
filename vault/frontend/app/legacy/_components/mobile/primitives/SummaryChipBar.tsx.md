---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx
status: active
updated: 2026-04-27
source_sha: 1d7ded1e79ef
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# SummaryChipBar.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2370` bytes

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
import { X } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export type SummaryChip = {
  key: string;
  label: string;
  tone?: string;
  onClick?: () => void;
  onRemove?: () => void;
};

export function SummaryChipBar({
  chips,
  trailing,
  className,
}: {
  chips: SummaryChip[];
  trailing?: React.ReactNode;
  className?: string;
}) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className={clsx("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}>
      {chips.map((chip) => {
        const tone = chip.tone ?? LEGACY_COLORS.blue;
        const Wrapper = chip.onClick ? "button" : "div";
        return (
          <Wrapper
            key={chip.key}
            type={chip.onClick ? "button" : undefined}
            onClick={chip.onClick}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-[6px] font-semibold transition-[transform,opacity]",
              chip.onClick && "active:scale-95",
              TYPO.caption,
            )}
            style={{
              background: `${tone as string}1a`,
              borderColor: `${tone as string}44`,
              color: tone,
            }}
          >
            <span className="truncate max-w-[160px]">{chip.label}</span>
            {chip.onRemove ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  chip.onRemove?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    chip.onRemove?.();
                  }
                }}
                className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                style={{ background: `${tone as string}33` }}
                aria-label="제거"
              >
                <X size={11} strokeWidth={2.5} />
              </span>
            ) : null}
          </Wrapper>
        );
      })}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
