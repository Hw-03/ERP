---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/
tags: [vault, index, folder-marker]
aliases:
  - "ui"
  - "ui.md"
---

# 📁 ui

> [!summary] 역할
> feature에 종속되지 않는 공용 UI 컴포넌트 (모달·시트·토스트·툴팁).

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/lib/ui/` 의 vault 미러.

## 어떤 파일들이 있나

barrel:
- [[erp/frontend/lib/ui/index.ts|index.ts]] — `Toast / ConfirmModal / BottomSheet / Tooltip / TruncatedText` 재노출

컴포넌트:
- [[erp/frontend/lib/ui/BottomSheet.tsx|BottomSheet.tsx]] — 모바일 바텀 시트. drag-to-dismiss(터치 핸들러 직접 구현, 의존성 0) 포함. `useFocusTrap` 사용
- [[erp/frontend/lib/ui/ConfirmModal.tsx|ConfirmModal.tsx]] — 확인 다이얼로그. `ConfirmTone`: `normal / caution / danger`
- [[erp/frontend/lib/ui/Toast.tsx|Toast.tsx]] — `ToastState` 타입 제공. `type`: `success / error / info`
- [[erp/frontend/lib/ui/Tooltip.tsx|Tooltip.tsx]] — hover 즉시 노출. `document.body` 포털 + `position:fixed` (부모 overflow/transform 영향 무시)
- [[erp/frontend/lib/ui/TruncatedText.tsx|TruncatedText.tsx]] — `truncate` CSS 로 잘렸을 때만 hover 툴팁 노출 (`scrollWidth > clientWidth` 조건부)

## 도메인 컨텍스트

Round-14 에서 `features/mes/shared` 에서 이 폴더로 이전. 모든 컴포넌트는 `LEGACY_COLORS` (`@/lib/mes/color`) 를 색상 참조로 사용하고 `useFocusTrap` (`@/lib/mes/useFocusTrap`) 을 포커스 관리에 사용한다.

`BottomSheet` 는 `prefers-reduced-motion` 을 감지해 드래그 스냅백 트랜지션만 0ms 로 처리한다.

## ⚠️ 위험 포인트

- 모든 파일은 `"use client"` — 서버 컴포넌트에서 직접 import 불가.
- `Tooltip / ConfirmModal` 은 `createPortal` 을 사용하므로 SSR 환경에서는 hydration 타이밍 주의.
- `BottomSheet` 의 `dismissThresholdPx` (기본 96) / `dismissVelocity` (기본 0.5) 는 UX 테스트 없이 변경하지 않는다.

## 관련 가이드

- [[erp/_vault/guides/ui-components]]

## 자식 폴더

- [[erp/frontend/lib/ui/__tests__/📁___tests__|__tests__/]]
