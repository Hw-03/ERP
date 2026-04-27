---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/Toast.tsx
status: active
updated: 2026-04-27
source_sha: 3440b17f09b9
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# Toast.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/Toast.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1393` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect } from "react";
import { LEGACY_COLORS } from "./legacyUi";

export interface ToastState {
  message: string;
  type: "success" | "error" | "info";
}

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 2800);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const borderColor =
    toast.type === "success"
      ? LEGACY_COLORS.green
      : toast.type === "error"
        ? LEGACY_COLORS.red
        : LEGACY_COLORS.blue;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,16px)+54px)] z-[500] w-[calc(100%-28px)] max-w-[402px] -translate-x-1/2">
      <div
        role={toast.type === "error" ? "alert" : "status"}
        aria-live={toast.type === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        className="rounded-xl border px-[14px] py-[10px] text-xs font-semibold"
        style={{
          background: LEGACY_COLORS.s3,
          borderColor: LEGACY_COLORS.border,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
          color: LEGACY_COLORS.text,
        }}
      >
        {toast.message}
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
