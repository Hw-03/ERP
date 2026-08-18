# mes/ - DEXCOWIN MES 메인 UI

이 폴더는 현재 운영 중인 DEXCOWIN MES 화면의 정본입니다.

- `/` 경로는 `frontend/app/page.tsx`를 통해 이 UI를 그대로 렌더링합니다.
- `/mes` 경로는 같은 UI로 직접 진입하는 App Router 경로입니다.
- 예전 폴더명은 `legacy/`였지만, 실제로 폐기된 화면이 아니라 운영 중인 메인 UI였고 2026년 6월에 `mes/`로 개명했습니다.

## 진입점

- `page.tsx`: 앱 전역 Provider를 감싸고 모바일/데스크톱 Shell을 선택합니다.
- `_components/mobile/MobileShell.tsx`: 모바일 Shell입니다.
- `_components/DesktopMesShell.tsx`: 데스크톱 Shell입니다.
- `_components/login/MesLoginGate.tsx`: 작업자 로그인 후 메인 UI를 렌더링합니다.

## 데스크톱 탭과 내비게이션

`DesktopMesShell.tsx`가 `?tab=` URL과 현재 탭을 동기화하고, `DesktopSidebar.tsx`가 접근 가능한 주요 탭을 표시합니다.

- `dashboard` — `DesktopInventoryView`: 대시보드와 재고 현황
- `warehouse` — `DesktopWarehouseView`: 입출고 요청과 V2 작업 진입
- `history` — `DesktopHistoryView`: 입출고 이력
- `shipping` — `DesktopShippingView`: 출하 요청·준비·픽업 이력
- `defect` — `DesktopDefectView`: 불량 처리
- `warehouseMap` — `DesktopWarehouseMapTab`: 창고 지도
- `weekly` — `DesktopWeeklyReportView`: 주간보고
- `dailyReport` — `DesktopDailyWorkReportView`: 일일 작업 일보
- `settings` — `AppearanceSettingsModal`의 설정 화면. 관리자 권한이 있으면 여기서 `admin` — `DesktopAdminView`로 진입

접근 가능한 탭은 로그인 작업자 권한에 따라 `tabAccess.ts`에서 필터링됩니다. URL을 직접 열더라도 권한이 없는 탭은 첫 접근 가능 탭으로 되돌립니다.

도메인별 하위 Module은 `_warehouse_v2/`, `_warehouse_sections/`, `_inventory_sections/`,
`_history_sections/`, `_defect_hub/`, `_admin_sections/`, `_weekly_sections/` 등에 나뉘어 있습니다.

## 리뷰 메모

- 처음 볼 때는 `page.tsx` 다음에 `DesktopMesShell.tsx`를 보면 전체 화면 흐름을 잡기 쉽습니다.
- 입출고 작업은 큰 파일을 열기 전에 `_components/_warehouse_v2/README.md`를 먼저 읽는 것이 좋습니다.
- `DesktopWeeklyReportView.tsx`와 `_weekly_sections/`는 frozen 상태입니다. 명시 요청이 있을 때만 수정합니다.
- `legacy_part`, `legacy_item_type` 같은 이름은 과거 원본 데이터 필드명이라 의도적으로 유지합니다.
