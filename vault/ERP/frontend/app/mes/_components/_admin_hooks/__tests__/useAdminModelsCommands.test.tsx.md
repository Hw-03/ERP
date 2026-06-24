# useAdminModelsCommands.test.tsx

## 이 파일은 뭐예요?
`useAdminModelsCommands` 훅의 단위 테스트. 모델 추가 입력 상태, 이름 빈값 시 추가 거부, 정상 추가 시 mutation 호출 페이로드, 순서 변경(`reorder`) 후 로컬 상태 즉시 반영을 검증한다.

## 언제 보나요?
- 모델 추가(`add`) 또는 드래그 순서 변경(`reorder`) 로직 수정 시
- `reorder` 시 `display_order`가 배열 인덱스 기준으로 재계산되는지 확인할 때

## 중요한 내용
- `useModelsQuery`의 `create/delete/reorder/update` mutation을 목
- 초기 상태: `modelAddName=""`, `modelAddSymbol=""`
- 검증 케이스:
  - `add` 이름 공백 → `createMutate` 미호출
  - `add` 이름 있을 때 → `{ model_name, symbol }` 페이로드로 `createMutate` 호출
  - `reorder` → `setProductModels` 즉시 호출 + `{ items:[{slot, display_order}...], pin }` 페이로드로 `reorderMutate` 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModelsCommands.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminModelsForm.test.tsx]] — 모델 form 훅 테스트
