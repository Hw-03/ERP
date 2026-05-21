---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/Toast.tsx
tags: [vault, code-note, auto-generated, stub]
---

# Toast.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/Toast.tsx]]

## 원본 첫 줄

```
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

```
