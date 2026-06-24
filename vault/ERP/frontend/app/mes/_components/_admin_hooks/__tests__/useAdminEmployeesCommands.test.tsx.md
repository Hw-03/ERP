# useAdminEmployeesCommands.test.tsx

## 이 파일은 뭐예요?
`useAdminEmployeesCommands` 훅의 단위 테스트. 직원 추가(`add`), 활성화 토글(`toggleActive`), 삭제(`delete`), PIN 초기화(`resetPin`) 동작의 정상 경로와 예외 경로를 검증한다.

## 언제 보나요?
- 직원 CRUD 또는 PIN 초기화 로직 수정 시
- 삭제 결과가 `deleted` vs `deactivated`로 갈리는 분기를 확인할 때

## 중요한 내용
- `useEmployeesQuery`의 4개 mutation(`create/update/delete/resetPin`)을 `mutateAsync` 기반으로 목
- 검증 케이스:
  - `add`: 이름 공백이면 `onError("이름은 필수입니다.")` + `createMutateAsync` 미호출
  - `add` 성공 시 `setEmployees`/`onStatusChange` 호출 및 생성 객체 반환
  - `toggleActive`: `is_active: false` 페이로드로 `updateMutateAsync` 호출
  - `delete`: result=`deleted` → `{deleted:true, updated:null}`, result=`deactivated` → `{deleted:false, updated.is_active:false}`
  - `resetPin`: adminPin 공백이면 `false` 반환, `resetPinMutateAsync` 미호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesCommands.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminEmployeesList.test.tsx]] — 직원 목록 훅 테스트
