# WarehouseAccessDenied.tsx

## 이 파일은 뭐예요?
입출고 권한이 없는 부서(AS·연구·영업 등)의 직원이 창고 화면에 진입했을 때 표시하는 안내 카드 컴포넌트.

## 언제 보나요?
- `DesktopWarehouseView`에서 해당 직원의 부서가 입출고 권한을 갖지 않을 때
- 재고 조회나 관리자 탭을 대신 사용하도록 안내해야 할 때

## 중요한 내용
- `WarehouseAccessDenied({ department })` — 단일 export, `department` prop에 부서명을 받아 메시지에 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]] — 창고 화면 전체 패널 분기 컴포넌트
