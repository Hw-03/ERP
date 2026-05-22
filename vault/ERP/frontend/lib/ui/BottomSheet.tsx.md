---
type: file-explanation
source_path: "frontend/lib/ui/BottomSheet.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BottomSheet.tsx — BottomSheet.tsx 설명

## 이 파일은 무엇을 책임지나

`BottomSheet.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/BottomSheet.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BottomSheet`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
  dismissThresholdPx?: number;
  /** 이 속도(px/ms) 이상으로 끌어내리면 닫힘 (기본 0.5) */
  dismissVelocity?: number;
  /** title 이 없을 때 dialog 접근명 (기본 "선택 시트") */
  ariaLabel?: string;
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
```
