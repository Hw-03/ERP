# AdminSectionContent.tsx

## 이 파일은 뭐예요?
관리자 화면에서 선택된 `section` 값에 따라 각 섹션 컴포넌트와 그 Context Provider를 조건 분기하는 라우터 역할의 컴포넌트입니다. 8개 섹션(items·employees·bom·models·departments·export·audit·settings)을 모두 여기서 조립합니다.

## 언제 보나요?
- `DesktopAdminView`에서 좌측 사이드바 섹션 선택 시 이 컴포넌트의 내용이 바뀜

## 중요한 내용
- `AdminSectionContent(props)` — export 컴포넌트
- `AdminSectionContentProps` — 모든 섹션에 필요한 props 집합(`items·employees·productModels·departments·allBomRows·pinForm·adminPin` 등)
- section 분기:
  - `"items"` → `AdminMasterItemsProvider` + `AdminMasterItemsSection`
  - `"employees"` → `AdminEmployeesProvider` + `AdminEmployeesSection`
  - `"bom"` → `BomWorkbench`
  - `"models"` → `AdminModelsProvider` + `AdminModelsSection`
  - `"departments"` → `AdminDepartmentsProvider` + `AdminDepartmentsSection`
  - `"export"` → `AdminExportSection`
  - `"audit"` → `AdminAuditLogSection`
  - `"settings"` → `AdminDangerZone`
- Round-11A #4 추출 — `DesktopAdminView`에서 분리됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopAdminView.tsx]] — 이 컴포넌트를 직접 사용하는 부모
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSidebar.tsx]] — 섹션 선택 사이드바
