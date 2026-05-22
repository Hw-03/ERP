---
type: file-explanation
source_path: "frontend/lib/ui/ConfirmModal.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ConfirmModal.tsx — ConfirmModal.tsx 설명

## 이 파일은 무엇을 책임지나

`ConfirmModal.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/ConfirmModal.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ConfirmModal`
- `ReactNode`
- `ConfirmTone`
- `Props`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  confirmAccent?: string;
}

export function ConfirmModal({
  open,
  title,
  onClose,
  onConfirm,
  tone = "normal",
  cautionMessage,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  busy = false,
  busyLabel = "처리 중...",
  confirmAccent,
}: Props) {
  // ESC 닫기 / Enter 확인 — busy 중에는 잠금
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
```
