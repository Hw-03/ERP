# useAdminEmployees.ts

## 이 파일은 뭐예요?
직원 관리 섹션(`AdminEmployeesSection`)이 사용하는 wrapper 훅입니다. Form·Confirm·Commands 세 sub-hook을 조합해 직원 추가/토글/수정/PIN 초기화/삭제 전체 흐름을 하나의 `AdminEmployeesState` 표면으로 통합합니다.

## 언제 보나요?
- 직원 추가·수정·삭제·PIN 초기화 버튼 동작을 추적할 때
- `saveEmployee()` 내부에서 어떤 필드를 API로 보내는지 확인할 때
- `dirty` (저장 안 한 편집 여부) 흐름을 따라갈 때

## 중요한 내용
- `useAdminEmployees(args: UseAdminEmployeesArgs): AdminEmployeesState`
- `addEmployee()`: `commands.add` 호출 후 성공 시 `resetAddForm` + 선택 직원 변경
- `saveEmployee()`: `api.updateEmployee` 직접 호출 — 조립 부서일 때만 `assigned_model_slots` 전송
- `confirmPinReset()`: `confirm.pinResetAdminPin` 검증 후 `commands.resetPin` 호출, 결과에 따라 에러 세팅
- `dirty`: `useAdminEmployeesForm`에서 원본 vs 현재 editForm 비교로 계산

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesForm.ts]] — 폼/선택/dirty sub-hook
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesConfirm.ts]] — confirm modal 상태
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployeesCommands.ts]] — CRUD mutation sub-hook
