# 📁 _components

## 이 폴더는 뭐예요?

`frontend/app/mes/page.tsx`가 화면에 그리는 모든 UI 조각이 여기 있습니다.  
데스크톱·모바일 두 셸(DesktopMesShell, MobileShell)과, 각 기능 탭에서 쓰는 섹션·훅·공용 컴포넌트가 기능별 하위 폴더로 나뉩니다.

루트에는 Shell 파일들과 탭별 View 파일(DesktopInventoryView, DesktopHistoryView 등)이 직접 위치합니다.

## 언제 여기를 보나요?

- 화면에 버그가 생겼을 때 — 어느 컴포넌트인지 좁히려고
- 새 UI 기능을 추가할 때 — 기존 패턴 파악 용도
- 기능 위치를 모를 때 — 하위 폴더 목록으로 방향 잡기

## 주요 하위 폴더

| 폴더 | 역할 |
|------|------|
| `_warehouse_v2/` | V2 입출고 워크플로우 메인 UI (가장 복잡한 단위) |
| `_warehouse_sections/` | 내 요청·부서 대기열·인수인계서 패널 |
| `_inventory_sections/` | 재고 대시보드 KPI·테이블·상세 패널 |
| `_admin_sections/` | 관리자 CRUD (품목·직원·부서·BOM 등) |
| `_history_sections/` | 거래 내역 필터·표·상세 |
| `_defect_hub/` | 불량 유형별 마법사 |
| `mobile/` | 모바일 전용 셸·화면·훅 |
| `common/` | 공용 원자 컴포넌트 |

## 주요 파일 (루트)

- `DesktopMesShell.tsx` — 탭 라우터 (7개 탭: 대시보드·입출고·창고맵·불량·내역·주간·관리자)
- `DesktopInventoryView.tsx` — 재고 대시보드 탭
- `DesktopWarehouseView.tsx` — V1 입출고 탭 (레거시, `_warehouse_v2/`로 대체 중)
- `DesktopHistoryView.tsx` — 거래 내역 탭
- `DesktopDefectView.tsx` — 불량 관리 탭
- `DesktopAdminView.tsx` — 관리자 탭
- `DesktopWarehouseMapView.tsx` — 창고 지도 탭
- `DesktopWeeklyReportView.tsx` — 주간 보고 탭 (동결)
- `ItemDetailSheet.tsx` — 품목 상세 슬라이드 패널
- `BarcodeScannerModal.tsx` — 바코드 스캔 모달

## 건드릴 때 조심할 점

- `_weekly_sections/` 및 `DesktopWeeklyReportView.tsx` 는 **동결** (2026-05-24). 명시 요청 없으면 수정 금지
- `mobile/MobileShell.tsx` 의 탭 바 디자인도 **동결** (2026-06-16). 레이아웃·CSS 수정 금지

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/page.tsx]] — 이 폴더를 조합하는 진입점
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 입출고 핵심
- [[ERP/frontend/lib/queries/📁_queries.md]] — 데이터 페칭 훅

> [!info]- 더 연결된 파일
> - [[ERP/frontend/lib/api/📁_api.md]] — API 클라이언트
> - [[ERP/backend/app/routers/📁_routers.md]] — 백엔드 엔드포인트
