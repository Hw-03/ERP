---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/SectionCard.tsx
status: active
updated: 2026-04-27
source_sha: 5c9361b6f0bc
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# SectionCard.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/SectionCard.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2251` bytes

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
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  padding = "md",
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padding?: "none" | "sm" | "md";
  className?: string;
}) {
  const pad = padding === "none" ? "p-0" : padding === "sm" ? "p-3" : "p-4";
  return (
    <div
      className={clsx("rounded-[20px] border overflow-hidden", className)}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {title || action ? (
        <div
          className="flex items-center justify-between gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <div className="min-w-0">
            {title ? (
              <div
                className={clsx(TYPO.overline, "font-bold uppercase tracking-[2px]")}
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div
                className={clsx(TYPO.body, "font-semibold")}
                style={{ color: LEGACY_COLORS.text }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={pad}>{children}</div>
    </div>
  );
}

export function SectionCardRow({
  label,
  value,
  valueColor,
  className,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-between py-[6px]", className)}>
      <span className={clsx(TYPO.caption, "font-semibold")} style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <span
        className={clsx(TYPO.body, "font-black text-right")}
        style={{ color: valueColor ?? LEGACY_COLORS.text }}
      >
        {value}
      </span>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
