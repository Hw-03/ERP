---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/common/SlidePanel.tsx
tags: [vault, code-note, c-tier]
---

# SlidePanel — 우측 슬라이드 패널 (드래그 오버레이)

> [!summary] open boolean 으로 폭 애니메이션(160ms). ESC 키 + focus trap. X 버튼 선택사항. aria-modal

## 1. 역할

width prop (기본값 436px). open=false일 때 width:0으로 접힘. onClose 있으면 X버튼+ESC활성. useFocusTrap.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/common/SlidePanel.tsx` ([[erp/frontend/app/legacy/_components/common/SlidePanel.tsx|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/common/AppSelect.tsx|AppSelect]]
- [[erp/frontend/app/legacy/_components/_hooks/useFocusTrap.ts|useFocusTrap]]
