---
type: file-explanation
source_path: "frontend/lib/ui/Toast.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# Toast.tsx — Toast.tsx 설명

## 이 파일은 무엇을 책임지나

`Toast.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/Toast.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Toast`
- `ToastState`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Toast — `@/lib/ui/Toast` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 */
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
```
