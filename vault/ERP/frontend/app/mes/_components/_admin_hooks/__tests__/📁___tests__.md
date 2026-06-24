# 📁 __tests__

## 이 폴더는 뭐예요?
`_admin_hooks` 안의 개별 커스텀 훅들을 단위 테스트하는 폴더. Vitest + `@testing-library/react`의 `renderHook`을 사용하며, 실제 API 호출 없이 mutation 훅을 목(mock)으로 교체해 상태 로직만 검증한다.

## 언제 여기를 보나요?
- 어드민 훅(부서/직원/품목/모델)의 CRUD 로직이나 폼 상태 관리 로직을 수정한 뒤 사이드 이펙트 여부를 확인할 때
- 새 어드민 훅을 추가하고 대응 테스트를 작성할 때

## 주요 파일
- `useAdminDepartmentsCommands.test.tsx` — 부서 추가·순서변경·색상변경 mutation 검증
- `useAdminDepartmentsForm.test.tsx` — 부서 추가 폼 상태(addName, dirty, reset) 검증
- `useAdminDepartmentsList.test.tsx` — 부서 목록 pass-through·메모이즈 검증
- `useAdminEmployeesCommands.test.tsx` — 직원 추가·토글·삭제·PIN초기화 검증
- `useAdminEmployeesList.test.tsx` — 직원 목록 검색·부서필터·정렬 검증
- `useAdminMasterItemsCommands.test.tsx` — 품목 추가 모드·addForm·add 검증
- `useAdminMasterItemsForm.test.tsx` — 품목 편집 폼 dirty 추적·save 검증
- `useAdminMasterItemsList.test.tsx` — 품목 목록 itemSearch+globalSearch 조합 필터 검증
- `useAdminModelsCommands.test.tsx` — 모델 추가·순서변경 mutation 검증
- `useAdminModelsForm.test.tsx` — 모델 편집 폼 initForm·dirty·save 검증
- `useAdminModelsList.test.tsx` — 모델 목록 pass-through·메모이즈 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/📁__admin_hooks]] — 테스트 대상 훅 모음
