# AdminRightPanelContent.tsx

## 이 파일은 뭐예요?
관리자 화면(DesktopAdminView) 우측 패널에 표시되는 요약·안내 카드를 렌더링하는 컴포넌트입니다. `section`이 "departments"이고 부서가 선택된 경우 `DeptManagementPanel`을 렌더하고, 그 외에는 섹션별 안내 문구와 전체 현황 카드(품목수·직원수·BOM수)를 보여줍니다.

## 언제 보나요?
- 관리자 화면에서 모든 섹션(items, employees, bom, export, audit, settings, departments) 우측 패널을 표시할 때
- 부서 목록에서 부서를 선택했을 때 우측에 DeptManagementPanel 대신 렌더됨

## 중요한 내용
- `AdminRightPanelContent` — export 컴포넌트
- `AdminRightPanelContentProps` — `section`, `selectedDept`, `departments`, `items`, `employees`, `allBomRows` 등 여러 집계용 props
- `section === "departments" && selectedDept` — `DeptManagementPanel`으로 분기
- 그 외 섹션 — 섹션별 안내 카드 + 현황(품목·직원·BOM 수, 재고부족 건수)
- `lowStockItems` — `min_stock != null && quantity < min_stock` 기준으로 계산

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/DeptManagementPanel.tsx]] — 부서 편집 패널
- [[ERP/frontend/app/mes/_components/DesktopAdminView.tsx]] — 이 컴포넌트를 사용하는 부모 (Round-11A 추출)
