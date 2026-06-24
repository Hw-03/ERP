# DeptManagementPanel.tsx

## 이 파일은 뭐예요?
관리자 화면 우측 패널에서 특정 부서를 선택했을 때 나타나는 부서 상세 편집 영역입니다. 색상 변경, 활성/비활성 토글, 영구 삭제 세 가지 조작만 담당하며, 각 동작은 API를 즉시 호출합니다.

## 언제 보나요?
- "부서 관리" 섹션에서 좌측 목록의 부서를 선택했을 때 우측에 표시
- `AdminRightPanelContent`를 통해 렌더됨

## 중요한 내용
- `DeptManagementPanel` — export 컴포넌트
- `DeptManagementPanelProps` — `dept`, `adminPin`, `departments`, `setDepartments`, `setSelectedDept`, `onStatusChange`, `onError`
- `applyColor()` — `api.updateDepartment`로 `color_hex` 변경
- `toggleActive()` / `_doToggle(next)` — 비활성화는 ConfirmModal 경유
- `deleteDept()` / `_doDelete()` — ConfirmModal (danger tone) 경유 후 영구 삭제
- `useRefreshDepartments()` — 변경 후 전역 부서 목록 갱신

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx]] — 이 패널을 조건부 렌더하는 부모
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useRefreshDepartments` 훅 제공
