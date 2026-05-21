---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/BottomSheet.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BottomSheet.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/BottomSheet.tsx]]

## 원본 첫 줄

```
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

/**
 * BottomSheet — `@/lib/ui/BottomSheet` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 * 모바일 개편: drag-to-dismiss(터치 핸들러 직접 구현, 의존성 0) 추가.
 *   - 핸들 바 또는 스크롤 최상단에서 아래로 끌면 시트가 따라 내려오고,
 *     임계 이동량/속도를 넘으면 onClose, 아니면 스냅백.
 *   - prefers-reduced-motion: 드래그 추적은 유지, 스냅백 트랜지션만 0ms.
 *   - 새 prop 미사용 시 기존 동작/시각과 완전 동일(후방호환).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissThresholdPx = 96,
  dismissVelocity = 0.5,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 이 픽셀 이상 끌어내리면 닫힘 (기본 96) */
```
