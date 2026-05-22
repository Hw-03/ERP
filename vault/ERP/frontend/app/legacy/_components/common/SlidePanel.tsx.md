---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/SlidePanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# SlidePanel.tsx — SlidePanel.tsx 설명

## 이 파일은 무엇을 책임지나

`SlidePanel.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `SlidePanelImpl`
- `SlidePanel`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

interface Props {
  open: boolean;
  width?: number;
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * 우측 슬라이딩 패널 — width 애니메이션(160ms) + 콘텐츠 페이드+슬라이드(260ms).
 * open=false 일 때 width:0 으로 접힌다.
 * onClose 제공 시: X 버튼 표시 + ESC 키로 닫힘 + focus trap + aria.
 */
function SlidePanelImpl({ open, width = 436, onClose, children }: Props) {
  const panelRef = useFocusTrap<HTMLDivElement>(open && !!onClose);
  const titleId = "slide-panel-title";

  // ESC 닫기 (onClose 있을 때만)
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // aria props — onClose 없으면 일반 region
  const dialogProps = onClose
    ? { role: "dialog" as const, "aria-modal": true, "aria-labelledby": titleId }
    : {};

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        ref={panelRef}
        className="relative flex h-full min-h-0 flex-col pl-4"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateX(0)" : "translateX(18px)",
          transition: "opacity 260ms ease, transform 260ms ease",
          willChange: "transform, opacity",
        }}
```
