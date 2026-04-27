---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/PrimaryActionButton.tsx
status: active
updated: 2026-04-27
source_sha: 5031184b3f22
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# PrimaryActionButton.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/PrimaryActionButton.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2653` bytes

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
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { formatNumber } from "../../legacyUi";

type Intent = "primary" | "success" | "danger" | "neutral";

const INTENT_STYLE: Record<Intent, { bg: string; fg: string }> = {
  primary: { bg: LEGACY_COLORS.blue, fg: "#fff" },
  success: { bg: LEGACY_COLORS.green, fg: "#041008" },
  danger: { bg: LEGACY_COLORS.red, fg: "#fff" },
  neutral: { bg: LEGACY_COLORS.s3, fg: LEGACY_COLORS.text },
};

export function PrimaryActionButton({
  label,
  sublabel,
  count,
  total,
  totalUnit,
  intent = "primary",
  icon: Icon,
  onClick,
  disabled,
  loadingText,
  className,
}: {
  label: string;
  sublabel?: string;
  count?: number;
  total?: number;
  totalUnit?: string;
  intent?: Intent;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  loadingText?: string;
  className?: string;
}) {
  const { bg, fg } = INTENT_STYLE[intent];
  const showMeta = count != null || total != null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center justify-center gap-3 rounded-[16px] px-4 py-[14px] font-black transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      style={{ background: bg, color: fg }}
    >
      {Icon ? <Icon size={18} strokeWidth={2.25} /> : null}
      <div className="flex min-w-0 flex-col items-center">
        <div className={clsx(TYPO.body, "font-black")}>
          {loadingText && disabled ? loadingText : label}
        </div>
        {sublabel ? (
          <div
            className={clsx(TYPO.overline, "font-semibold opacity-80 tracking-[1px]")}
          >
            {sublabel}
          </div>
        ) : null}
      </div>
      {showMeta && !disabled ? (
        <div className="flex shrink-0 items-center gap-2 opacity-90">
          {count != null ? (
            <span
              className={clsx(TYPO.caption, "rounded-full px-2 py-[2px] font-black tabular-nums")}
              style={{ background: "rgba(0,0,0,.18)" }}
            >
              {count}건
            </span>
          ) : null}
          {total != null ? (
            <span className={clsx(TYPO.caption, "font-black tabular-nums")}>
              · {formatNumber(total)}
              {totalUnit ? ` ${totalUnit}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
