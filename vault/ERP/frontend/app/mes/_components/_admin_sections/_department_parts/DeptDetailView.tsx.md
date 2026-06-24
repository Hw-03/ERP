# DeptDetailView.tsx

## 이 파일은 뭐예요?
선택된 부서의 상세 편집 패널입니다. 부서명 수정, 색상 변경(hex 직접 입력 + 36색 Tailwind 프리셋 스와치), 소속 직원 미리보기, 부서 활성/비활성화 및 영구 삭제 요청을 한 화면에서 처리합니다.

## 언제 보나요?
- 관리자가 부서 목록에서 특정 부서를 클릭해 우측(또는 하단) 상세 패널이 열릴 때
- "저장" 버튼은 부모가 헤더에 배치하며, `onSaveRef`를 통해 내부 `save()` 함수를 부모에게 노출합니다

## 중요한 내용
- `DeptDetailViewProps` — `dept`, `adminPin`, `empCount`, `itemCount`, `deptEmployees`, `onSetDepartments`, `setSelectedDept`, `onStatusChange`, `onError`, `onToggleActive`, `onRequestDelete`, `onSaveRef?`, `onDirtyChange?`
- `dirty` — 이름 또는 색상이 저장값과 다를 때 true. `onDirtyChange` 콜백으로 부모에 전파
- `onSaveRef` — 부모 헤더의 저장 버튼이 이 컴포넌트의 `save()`를 직접 호출할 수 있도록 함수를 ref 형태로 주입
- `save()` — `api.updateDepartment()` 호출 → 성공 시 목록 갱신 + `refreshDepartments()`
- `TAILWIND_PALETTE` (from `departmentColors`) — 9 hue × 4 shade = 36개 색상 스와치
- `ConfirmModal` — 부서 비활성화 시 이중 확인 다이얼로그

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx]] — 이 뷰를 렌더하는 부모
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useRefreshDepartments` 제공
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/departmentColors.ts]] — `deptColor`, `TAILWIND_PALETTE`
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/departmentDetailPrimitives.tsx]] — `DetailCardSlot`, `MetaCell`
- [[ERP/frontend/lib/ui/ConfirmModal.tsx]] — 비활성화 확인 모달
