---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/BottomSheet.tsx
status: active
updated: 2026-04-27
source_sha: c2be57e59c59
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# BottomSheet.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/BottomSheet.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2375` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect, useId } from "react";
import { LEGACY_COLORS } from "./legacyUi";
import { useFocusTrap } from "./_hooks/useFocusTrap";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "선택 시트"}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-[430px] overflow-y-auto rounded-t-[22px] border-t"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "92vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)",
          animation: "sheetUp .25s cubic-bezier(.32,1.2,.6,1)",
        }}
        data-anim="sheetUp"
        onClick={(event) => event.stopPropagation()}
      >
        <style jsx>{`
          @keyframes sheetUp {
            from {
              transform: translateY(60px);
              opacity: 0;
            }
            to {
              transform: none;
              opacity: 1;
            }
          }
        `}</style>
        <div className="mx-auto my-3 h-1 w-[34px] rounded-full" style={{ background: LEGACY_COLORS.s3 }} />
        {title ? (
          <div className="mb-[14px] px-5">
            <div id={titleId} className="text-lg font-black">{title}</div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
