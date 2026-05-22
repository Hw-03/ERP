---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/
tags: [vault, index, folder-marker]
aliases:
  - "_components"
  - "_components.md"
---

# 📁 _components

> [!summary] 역할
> DEXCOWIN MES 전체 UI 컴포넌트의 집합소. 도메인별 서브폴더와 루트 레벨 공통 컴포넌트 20여 개로 구성된다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/` 의 vault 미러.

## 어떤 파일들이 있나

루트 레벨 핵심 파일:
- `DesktopLegacyShell.tsx` — 데스크톱 진입 셸. 사이드바·탑바·메인뷰 조합
- `DesktopRightPanel.tsx` — 우측 슬라이딩 패널 공통 컨테이너
- `ItemDetailSheet.tsx` — 품목 상세 슬라이드 시트 (재고·입출고 공용)
- `PinLock.tsx` / `DesktopPinLock.tsx` — PIN 잠금 화면
- `BarcodeScannerModal.tsx` — 바코드 스캔 모달
- `SelectedItemsPanel.tsx` — 다중 선택 품목 패널
- `ThemeToggle.tsx` — 다크/라이트 테마 전환
- `DepartmentsContext.tsx` — 전역 부서 목록 Context + useDeptColorLookup 훅
- `CapacityDetailModal.tsx` — 생산가능 상세 모달

루트 레벨 뷰 컴포넌트:
- `DesktopAdminView.tsx`, `DesktopInventoryView.tsx`, `DesktopWarehouseView.tsx`, `DesktopHistoryView.tsx`, `DesktopWeeklyReportView.tsx`

## 도메인 컨텍스트

각 도메인 화면은 서브폴더 단위로 분리되어 있다. 루트 레벨 `Desktop*View.tsx` 가 각 탭의 최상위 뷰이고,
내부 세부 UI 는 대응 섹션 폴더(`_*_sections/`)로 위임한다.

## ⚠️ 위험 포인트

- `_archive/` 하위 파일은 비활성 코드다. 수정 대상 아님.
- `_warehouse_v2/` 는 입출고 v2 재설계 결과물로, 서비스 레이어와 강결합되어 있다.

## 관련 가이드

- [[erp/_vault/guides/frontend-components]]

## 자식 폴더

- [[erp/frontend/app/legacy/_components/_warehouse_v2/📁__warehouse_v2|_warehouse_v2/]] — 입출고 v2 핵심
- [[erp/frontend/app/legacy/_components/_warehouse_sections/📁__warehouse_sections|_warehouse_sections/]] — 입출고 화면 섹션
- [[erp/frontend/app/legacy/_components/_inventory_sections/📁__inventory_sections|_inventory_sections/]] — 재고 화면 섹션
- [[erp/frontend/app/legacy/_components/_history_sections/📁__history_sections|_history_sections/]] — 이력 화면 섹션
- [[erp/frontend/app/legacy/_components/_admin_sections/📁__admin_sections|_admin_sections/]] — 관리자 화면 섹션
- [[erp/frontend/app/legacy/_components/_warehouse_hooks/📁__warehouse_hooks|_warehouse_hooks/]] — 입출고 전용 훅
- [[erp/frontend/app/legacy/_components/_admin_hooks/📁__admin_hooks|_admin_hooks/]] — 관리자 전용 훅
- [[erp/frontend/app/legacy/_components/_inventory_hooks/📁__inventory_hooks|_inventory_hooks/]] — 재고 전용 훅
- [[erp/frontend/app/legacy/_components/_history_hooks/📁__history_hooks|_history_hooks/]] — 이력 전용 훅
- [[erp/frontend/app/legacy/_components/_hooks/📁__hooks|_hooks/]] — 공용 훅
- [[erp/frontend/app/legacy/_components/_warehouse_steps/📁__warehouse_steps|_warehouse_steps/]] — 입출고 스텝 UI
- [[erp/frontend/app/legacy/_components/_weekly_sections/📁__weekly_sections|_weekly_sections/]] — 주간보고 섹션
- [[erp/frontend/app/legacy/_components/common/common|common/]] — 공통 원자 컴포넌트
- [[erp/frontend/app/legacy/_components/login/login|login/]] — 로그인 게이트
- [[erp/frontend/app/legacy/_components/mobile/mobile|mobile/]] — 모바일 전용 컴포넌트
