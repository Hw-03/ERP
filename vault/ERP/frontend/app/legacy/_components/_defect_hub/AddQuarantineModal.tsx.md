# AddQuarantineModal.tsx

## 이 파일은 뭐예요?

정상 재고에서 불량 항목을 즉시 격리하는 모달. 결재 없이 즉시 처리된다.
품목 검색 → 출처(창고/부서) 선택 → 수량 입력 → 사유 입력 → `defectsApi.quarantine()` 호출
순서로 진행된다.

## 언제 보나요?

- 퀵 액션의 [새 격리 추가] 버튼 동작을 수정할 때
- 격리 출처 로직(창고 vs 부서 재고)을 바꿀 때
- 품목 검색 debounce/결과 표시를 조정할 때
- 격리 제출 실패 에러 메시지를 수정할 때

## 중요한 내용

### Props

```ts
export interface AddQuarantineModalProps {
  open: boolean;
  onClose: () => void;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}
```

### 주요 상태

| 상태 | 설명 |
|---|---|
| `query` / `results` / `searching` | 품목 검색 입력값 / 결과 목록 / 로딩 |
| `selected` | 선택된 품목 (`Item`) |
| `source` | `"warehouse"` (창고) 또는 `"production"` (부서) |
| `dept` | 격리 대상 부서 (생산 6라인 중 선택) |
| `qty` / `category` / `memo` | 수량, 사유 카테고리, 사유 메모 |
| `busy` / `error` | 제출 중 플래그 / 에러 메시지 |

### 동작 흐름

1. **품목 검색** — `query` 입력 200ms debounce 후 `itemsApi.getItems()` 호출, AbortController로 이전 요청 취소
2. **출처 선택** — 라디오 버튼
   - `warehouse`: 창고에서 차감 → 선택 부서 [불량]으로 격리
   - `production`: 선택 부서의 정상 재고에서 같은 부서 [불량]으로 이동
3. **제출 조건** (`canSubmit`): `selected` 있음 + `category` 있음 + `qty > 0`
4. **제출** — `defectsApi.quarantine(payload)` 호출
   - `source_dept`: `production` 모드일 때만 포함
   - 성공 → `onSubmitted()` + `onClose()` 호출
5. **모달 열릴 때** 폼 전체 초기화, **ESC** 키로 닫기

### 초기 dept 값

현재 로그인 직원의 부서가 생산 6라인이면 그 부서, 아니면 첫 번째 라인("튜브")으로 초기화.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/defects.ts]] — `defectsApi.quarantine()` 호출
- [[ERP/frontend/lib/api/types/defects.ts]] — `QuarantinePayload` 타입
- [[ERP/frontend/lib/api/items.ts]] — `itemsApi.getItems()` — 품목 검색

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/legacy/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 카테고리/메모 공통 폼
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx]] — 이 모달을 열고 닫는 부모

## 핵심 발췌

```tsx
async function handleSubmit() {
  if (!canSubmit || !selected) return;
  setBusy(true);
  try {
    await defectsApi.quarantine({
      item_id: selected.item_id,
      qty: qtyNum,
      source,
      source_dept: source === "production" ? dept : undefined,
      target_dept: dept,
      reason_category: category,
      reason_memo: memo,
      actor_employee_id: currentEmployee.employee_id,
    });
    onSubmitted();
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : "격리 처리 중 오류가 발생했습니다.");
  } finally {
    setBusy(false);
  }
}
```
