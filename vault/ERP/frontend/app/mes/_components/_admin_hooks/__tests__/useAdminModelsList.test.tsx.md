# useAdminModelsList.test.tsx

## 이 파일은 뭐예요?
`useAdminModelsList` 훅의 단위 테스트. 입력 모델 배열의 pass-through, 입력 변경 시 `visibleItems` 동기화, 동일 reference 입력 시 메모이즈 동작을 검증한다.

## 언제 보나요?
- `useAdminModelsList`의 목록 노출 로직(메모이제이션, 동기화)을 수정할 때
- 모델 목록이 리렌더 시 불필요하게 교체되는 성능 문제를 확인할 때

## 중요한 내용
- 외부 의존성 없이 동작
- 검증 케이스:
  - 빈 배열 → `items=[]`, `visibleItems=[]`
  - 입력 그대로 pass-through (`items === productModels`)
  - 입력 배열 길이 변경 시 `visibleItems` 동기화
  - 동일 reference 재렌더 시 `visibleItems`가 같은 객체(`toBe`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsList.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminModelsCommands.test.tsx]] — 모델 commands 훅 테스트
