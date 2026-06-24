# useAdminModelsForm.test.tsx

## 이 파일은 뭐예요?
`useAdminModelsForm` 훅의 단위 테스트. 폼 초기화(`initForm`), `setForm`으로 값 변경 시 `dirty` 플래그, 저장(`save`) 시 빈 이름 검증과 올바른 mutation 페이로드를 검증한다.

## 언제 보나요?
- 모델 편집 폼의 `dirty` 추적이나 `save` 호출 시 PIN 포함 페이로드 구성 로직 수정 시
- `initForm` 호출 후 `dirty=false`로 초기화되는지 확인할 때

## 중요한 내용
- `useUpdateModelMutation`만 `mutateMock`으로 목, 나머지는 `vi.fn()`으로 더미
- 초기 상태: `form={model_name:"", symbol:""}`, `dirty=false`, `saving=false`
- 검증 케이스:
  - `initForm` → form 동기화, `dirty=false`
  - `setForm` 값 변경 → `dirty=true`
  - `save` 시 `model_name` 공백 → `onError("모델명을 입력하세요.")` + `mutateMock` 미호출
  - `save` 성공 → `{ slot, payload:{ model_name, symbol, pin } }` 페이로드로 `mutateMock` 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsForm.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminModelsCommands.test.tsx]] — 모델 commands 훅 테스트
