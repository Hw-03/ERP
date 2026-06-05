# legacy/ — DEXCOWIN MES 메인 UI

> **이 폴더는 낡거나 폐기된 코드가 아닙니다.**
> 현재 운영 중인 DEXCOWIN MES의 모든 화면이 여기에 있습니다.

## "legacy"인데 왜 메인인가요?

- 루트 경로 `/` 는 이 폴더를 그대로 렌더합니다. `frontend/app/page.tsx` 가 `./legacy/page` 를 re-export 하기 때문입니다.
- 즉 사용자가 접속하면 보게 되는 실제 화면이 전부 이 폴더에서 나옵니다.
- 이름이 `legacy` 인 이유: Next.js App Router 로 옮기기 전부터 쓰던 경로명이고, URL 호환성 때문에 그대로 둔 것입니다. **"오래됐다 / 안 쓴다" 는 뜻이 아닙니다.**

## 구조

- `page.tsx` — 진입점. 화면 폭에 따라 두 갈래로 나뉩니다.
  - 모바일: `_components/mobile/MobileShell`
  - 데스크톱: `_components/DesktopLegacyShell`
  - 바깥을 로그인 게이트(`MesLoginGate`)와 전역 Provider(관리자 세션 / React Query / 부서 정보)가 감쌉니다.
- `_components/` — 모든 화면 컴포넌트.

## 주요 화면 (`_components/Desktop*View.tsx`)

- `DesktopInventoryView` — 재고
- `DesktopWarehouseView` / `DesktopWarehouseMapView` — 창고 / 창고 지도
- `DesktopHistoryView` — 입출고 내역
- `DesktopDefectView` — 불량 처리
- `DesktopAdminView` — 관리자
- `DesktopWeeklyReportView` — 주간 보고

화면별 하위 로직은 도메인별 폴더에 나뉘어 있습니다:
`_inventory_sections/`, `_warehouse_sections/`, `_warehouse_v2/`(입출고 작업), `_history_sections/`, `_defect_hub/`, `_admin_sections/`, `_weekly_sections/` 등. 각 도메인의 커스텀 훅은 `_*_hooks/` 에 있습니다.

## 건드릴 때 조심할 점

- `_archive/` — 보관소입니다. 명시적 요청 없이는 수정하지 마세요.
- `DesktopWeeklyReportView.tsx` + `_weekly_sections/` — **frozen(완료)** 상태입니다. 명시적 요청이 있을 때만 손대세요.
- 컴포넌트를 수정하기 전에는 실제 렌더/임포트 경로를 먼저 확인하세요.
