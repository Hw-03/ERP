---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/ConfirmModal.tsx
tags: [vault, code-note, auto-generated, stub]
---

# ConfirmModal.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/ConfirmModal.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

/**
 * ConfirmModal — `@/lib/ui/ConfirmModal` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 */
export type ConfirmTone = "normal" | "caution" | "danger";

const TONE_ACCENT: Record<ConfirmTone, string> = {
  normal: LEGACY_COLORS.blue,
  caution: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
};

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  tone?: ConfirmTone;
  cautionMessage?: string;
  children?: ReactNode;
  confirmLabel?: string;
```
