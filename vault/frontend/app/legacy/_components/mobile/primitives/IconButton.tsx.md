---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/IconButton.tsx
status: active
updated: 2026-04-27
source_sha: 84dab1fec739
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# IconButton.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/IconButton.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2143` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { forwardRef } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";

type Variant = "ghost" | "solid" | "outline";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { box: string; icon: number }> = {
  sm: { box: "h-8 w-8", icon: 16 },
  md: { box: "h-10 w-10", icon: 20 },
  lg: { box: "h-12 w-12", icon: 22 },
};

export const IconButton = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    variant?: Variant;
    size?: Size;
    color?: string;
    className?: string;
    disabled?: boolean;
    badge?: number;
    type?: "button" | "submit";
  }
>(function IconButton(
  { icon: Icon, label, onClick, variant = "ghost", size = "md", color, className, disabled, badge, type = "button" },
  ref,
) {
  const { box, icon } = SIZE[size];
  const tone = color ?? LEGACY_COLORS.text;

  const style =
    variant === "solid"
      ? { background: color ?? LEGACY_COLORS.s3, color: "#fff" }
      : variant === "outline"
      ? { background: "transparent", borderColor: LEGACY_COLORS.border, color: tone }
      : { background: "transparent", color: tone };

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-[14px] transition-[transform,opacity] active:scale-95 disabled:opacity-40",
        variant === "outline" && "border",
        box,
        className,
      )}
      style={style}
    >
      <Icon size={icon} strokeWidth={1.75} />
      {badge != null && badge > 0 ? (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: LEGACY_COLORS.red, color: "#fff" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
});
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
