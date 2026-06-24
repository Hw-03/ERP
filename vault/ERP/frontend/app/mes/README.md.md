# README.md

## 이 파일은 뭐예요?
`frontend/app/mes/` 폴더의 구조와 진입점·주요 화면·리뷰 순서를 설명하는 개발자용 안내 문서입니다. 코드가 아니라 이 폴더를 처음 보는 사람이 빠르게 방향을 잡도록 돕는 텍스트 파일입니다.

## 언제 보나요?
- `mes/` 폴더를 처음 열었을 때 전체 구조를 훑고 싶을 때
- 어떤 하위 폴더가 어떤 화면을 담당하는지 기억이 안 날 때

## 중요한 내용
- `/mes` 진입점: `page.tsx` → `DesktopMesShell` / `MobileShell`
- 주요 데스크톱 뷰: Inventory, Warehouse, WarehouseMap, History, Defect, Admin, WeeklyReport
- 도메인별 모듈 위치 목록(`_warehouse_v2/`, `_admin_sections/` 등)
- `DesktopWeeklyReportView` + `_weekly_sections/` 는 frozen — 명시 요청 없이 수정 금지
- `legacy_part`, `legacy_item_type` 은 원본 데이터 필드명이라 의도적으로 유지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/page.tsx]] — 실제 진입점 코드
- [[ERP/frontend/app/mes/_components/DesktopMesShell.tsx]] — 데스크톱 전체 화면 흐름
