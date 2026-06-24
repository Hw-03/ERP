# useAdminModelsForm.ts

## 이 파일은 뭐예요?
모델 인라인 편집 폼(`model_name`, `symbol`)의 상태·dirty 계산·저장을 담은 Form sub-hook입니다. `base` 상태와 비교해 변경 여부를 계산하고, `saving` 플래그로 저장 중 중복 클릭을 방지합니다.

## 언제 보나요?
- 모델 이름/심볼 인라인 편집이 저장되지 않거나 `dirty` 가 예상과 다를 때
- `initForm(model)` 호출 시점을 추적할 때

## 중요한 내용
- `ModelEditForm`: `{ model_name: string; symbol: string }`
- `initForm(model)`: `form`과 `base` 동시 초기화 — 선택 모델 변경 시 호출
- `dirty`: `form.model_name !== base.model_name || form.symbol !== base.symbol`
- `saving`: mutation 진행 중 true (onSettled에서 false)
- `save(slot)`: 성공 후 `setBase` 갱신으로 dirty 해제

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — `useUpdateModelMutation`
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModels.ts]] — 이 훅을 포함하는 wrapper
