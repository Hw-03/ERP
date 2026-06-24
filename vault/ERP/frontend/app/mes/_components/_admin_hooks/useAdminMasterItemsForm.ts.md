# useAdminMasterItemsForm.ts

## 이 파일은 뭐예요?
선택된 품목의 인라인 편집 폼 상태(`editForm`)와 단일 필드 즉시 저장(`saveField`) / 전체 일괄 저장(`save`) / `dirty` 플래그를 담은 Form sub-hook입니다.

## 언제 보나요?
- 품목 편집 폼 저장이 실패하거나 `mes_code`가 갱신되지 않을 때
- `min_stock` 필드 저장 시 숫자 변환 로직을 확인할 때
- `model_slots` 자동 추론(`inferModelSlots`)이 어떻게 동작하는지 볼 때

## 중요한 내용
- `ItemEditForm`: item_name / legacy_item_type / supplier / min_stock / process_type_code / unit / model_slots / mes_code
- `itemToEditForm(item)`: mes_code에서 `inferModelSlots`로 model_slots 자동 추론 (저장된 slots 우선)
- `save()`: `mes_code`는 프론트에서 전송하지 않음 — 백엔드 자동 부여. 저장 후 응답으로 form 재동기화 필요(`setFormState` 명시 호출)
- `saveField`: 필드 한 개만 즉시 저장 (min_stock은 Number 변환)
- `SYMBOL_TO_SLOT`: mes_code 첫 세그먼트의 문자 → 모델 slot 번호 매핑 상수

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `api.updateItem`
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — 이 훅을 포함하는 wrapper
