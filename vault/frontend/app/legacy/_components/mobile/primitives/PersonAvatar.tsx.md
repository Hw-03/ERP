---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/PersonAvatar.tsx
status: active
updated: 2026-04-27
source_sha: dc2f495577e4
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# PersonAvatar.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/PersonAvatar.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1695` bytes

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
import { employeeColor, firstEmployeeLetter, LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

type Size = "sm" | "md" | "lg";
const SIZE: Record<Size, { box: string; text: string }> = {
  sm: { box: "h-9 w-9", text: TYPO.caption },
  md: { box: "h-11 w-11", text: TYPO.body },
  lg: { box: "h-14 w-14", text: TYPO.title },
};

export function PersonAvatar({
  name,
  department,
  selected = false,
  onClick,
  size = "md",
  showLabel = true,
  className,
}: {
  name: string;
  department?: string | null;
  selected?: boolean;
  onClick?: () => void;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const color = employeeColor(department);
  const { box, text } = SIZE[size];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("flex shrink-0 flex-col items-center gap-1 active:scale-95", className)}
    >
      <div
        className={clsx(
          "flex items-center justify-center rounded-full font-black uppercase",
          box,
          text,
        )}
        style={{
          background: selected ? color : `${color}22`,
          color: selected ? "#fff" : color,
          border: `2px solid ${selected ? color : "transparent"}`,
          transition: "background-color .15s, border-color .15s",
        }}
      >
        {firstEmployeeLetter(name)}
      </div>
      {showLabel ? (
        <div className={clsx(TYPO.caption, "font-semibold")} style={{ color: selected ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
          {name}
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
