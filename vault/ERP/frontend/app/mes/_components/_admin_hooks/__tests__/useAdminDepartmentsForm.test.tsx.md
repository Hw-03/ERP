# useAdminDepartmentsForm.test.tsx

## 이 파일은 뭐예요?
`useAdminDepartmentsForm` 훅의 단위 테스트. 폼 초기 상태, `setAddName`·`setDirty`·`reset` 동작이 정확히 상태를 바꾸는지 검증한다.

## 언제 보나요?
- 부서 추가 입력 폼 관련 상태 로직을 수정할 때
- `dirty` 플래그가 올바르게 초기화되지 않는 버그를 디버깅할 때

## 중요한 내용
- 외부 의존성 없이 `renderHook` 만으로 동작 (QueryClient 불필요)
- 검증 케이스: 초기 `addName=""` + `dirty=false`, `setAddName`으로 값 변경, `setDirty` 토글, `reset` 후 `addName`/`dirty` 모두 초기화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminDepartmentsForm.ts]] — 테스트 대상 훅
