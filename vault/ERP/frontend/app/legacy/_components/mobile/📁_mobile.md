---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/
tags: [vault, index, folder-marker]
aliases:
  - "mobile"
  - "mobile.md"
---

# 📁 mobile

> [!summary] 역할
> 모바일 UI 진입점. `MobileShell.tsx` 가 탭 네비게이션을 관리하고, 하위 `screens/` 가 각 탭 화면을 담당한다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/mobile/` 의 vault 미러.

## 어떤 파일들이 있나

**루트 파일**
- [[erp/frontend/app/legacy/_components/mobile/MobileShell.tsx.md|MobileShell.tsx]] — 5개 탭(대시보드·입출고·이력·주간·관리자) 진입점. 탭 전환·PIN 인증·모달 상태 관리.
- `tokens.ts` — 모바일 전용 디자인 토큰 (색상·간격)

**screens/** — 각 탭에 1:1 대응하는 스크린 컴포넌트
- `MobileDashboardScreen.tsx`, `MobileWarehouseScreen.tsx`, `MobileHistoryScreen.tsx`, `MobileWeeklyScreen.tsx`, `MobileAdminScreen.tsx`

**hooks/** — 스크린 단위 데이터 훅
- `useEmployees.ts`, `useItems.ts`, `useModels.ts`, `useTransactions.ts`, `useMobileHistoryAux.ts`

**primitives/** — 모바일 전용 UI 원자 컴포넌트
- `BottomSheet.tsx`, `ConfirmModal.tsx`, `Toast.tsx`, `Tooltip.tsx`, `TruncatedText.tsx`
- `AsyncState.tsx`, `EmptyState.tsx`, `ErrorAlert.tsx`, `FilterChip.tsx`, `IconButton.tsx`
- `KpiCard.tsx`, `ItemRow.tsx`, `MoreMenuRow.tsx`, `PersonAvatar.tsx`, `PinInput.tsx`
- `PrimaryActionButton.tsx`, `QuickActionGrid.tsx`, `SectionCard.tsx`, `SectionHeader.tsx`
- `SegmentedControl.tsx`, `SheetHeader.tsx`, `StatusBadge.tsx`, `Stepper.tsx`
- `StickyFooter.tsx`, `SubScreenHeader.tsx`, `SummaryChipBar.tsx`, `WizardHeader.tsx`, `WizardProgress.tsx`

**history/** — 모바일 이력 UI
- `MobileHistoryList.tsx`

**warehouse/** — 모바일 입출고 플로우 (wizard 방식)
- `MobileWorkTypeStep.tsx`, `MobileIoComposeWizard.tsx`

**admin/** — 모바일 관리자 화면

## 도메인 컨텍스트

데스크톱 뷰(`DesktopLegacyShell`)와 달리 모바일은 단일 `MobileShell` 에서 탭 상태를 직접 관리한다.  
입출고는 wizard step 방식 (`MobileIoComposeWizard` → step 컴포넌트들) 으로 동작하며, `_warehouse_steps/` 의 `canEnterIO` 를 통해 접근 권한을 판단한다.  
`primitives/` 는 데스크톱 `common/` 과 무관하게 모바일 전용으로 별도 구축됨.

## ⚠️ 위험 포인트

- `MobileShell.tsx` 는 `useCurrentOperator` 와 `canEnterIO` 에 의존 — 인증 상태 변경 시 탭 접근 제어 로직 확인.
- `screens/` 에 `admin/` 하위 폴더도 별도 존재하므로 `mobile/admin/` ≠ `_admin_sections/` 주의.

## 관련 가이드

- [[erp/_vault/guides/mobile-flow]]

## 자식 폴더

- [[erp/frontend/app/legacy/_components/mobile/admin/📁_admin|admin/]]
- [[erp/frontend/app/legacy/_components/mobile/history/📁_history|history/]]
- [[erp/frontend/app/legacy/_components/mobile/hooks/📁_hooks|hooks/]]
- [[erp/frontend/app/legacy/_components/mobile/primitives/📁_primitives|primitives/]]
- [[erp/frontend/app/legacy/_components/mobile/screens/📁_screens|screens/]]
- [[erp/frontend/app/legacy/_components/mobile/warehouse/📁_warehouse|warehouse/]]
