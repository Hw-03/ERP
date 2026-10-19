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

### 데스크톱 불량 처리 진입

- `DefectWorkChoice`에서 격리 등록·즉시 폐기·즉시 재작업을 선택합니다. 최초에는 출처를 표시하지 않습니다.
- 격리·폐기를 고르면 같은 화면에서 출처가 펼쳐지고, 부서·창고 재고를 클릭하면 별도 다음 버튼 없이 품목 화면으로 진행합니다.
- 재작업은 부서 재고로 바로 진입하며, 품목 입력 후 기존 BOM 확인과 최종 확인 팝업을 유지합니다.
- 품목 화면에서 이전으로 돌아갈 때 입력된 카트가 있으면 폐기 확인을 표시합니다. BOM에서 품목으로 돌아갈 때는 입력을 유지합니다.

### 불량 통계의 분류 조회

- 최초 등록 날짜·원래 수량·최초 분류를 기준으로 불량·B급·구형을 집계합니다. 이후 분류 변경과 처리로 과거 등록량이 바뀌지 않습니다.
- 상단 분류를 선택하면 조회 합계·이전 기간 비교·추이·품목·부서·사유 집계가 함께 바뀝니다. 선택한 분류를 다시 누르거나 전체 버튼을 누르면 전체 조회로 돌아갑니다.
- 상단 분류 카드의 수량과 건수는 분류 선택을 제외한 나머지 조회 조건의 모수를 유지합니다. 분류 선택은 기간 변경에도 유지되며 전체 초기화로 해제됩니다.
- 그래프는 분류별 수량을 누적하고, 품목 표는 등록 합계 아래에 같은 색으로 분류별 수량을 표시합니다. 직접 처리의 창고 출처는 명시 부서 또는 창고 차감 효과로 확인합니다.
## 리뷰 메모

- 처음 볼 때는 `page.tsx` 다음에 `DesktopMesShell.tsx`를 보면 전체 화면 흐름을 잡기 쉽습니다.
- 입출고 작업은 큰 파일을 열기 전에 `_components/_warehouse_v2/README.md`를 먼저 읽는 것이 좋습니다.
- `DesktopWeeklyReportView.tsx`와 `_weekly_sections/`는 frozen 상태입니다. 명시 요청이 있을 때만 수정합니다.
- `legacy_part`, `legacy_item_type` 같은 이름은 과거 원본 데이터 필드명이라 의도적으로 유지합니다.
