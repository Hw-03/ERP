# PaPfDefectWizard.tsx

## 이 파일은 뭐예요?

PA(완제품) / PF(반제품) 타입 격리 품목 처리 위자드. BOM 분해가 가능한 품목이므로
단순 폐기/반품 외에 자식 부품별로 처리 방식을 결정하는 "분해" 옵션이 추가된다.
`DefectHubPanel`이 `item_code` 두 번째 segment가 `PA` 또는 `PF`일 때 이 컴포넌트를 열어준다.

## 언제 보나요?

- PA/PF 품목 [처리] 모달의 UI나 로직을 수정할 때
- BOM 분해 트리(`DisassembleTree`)와 연동 방식을 파악할 때
- `defect_disassemble` / `defect_scrap` 결재 요청 생성 방식을 바꿀 때
- 정상 복귀(`unquarantine`) 흐름을 수정할 때

## 중요한 내용

### Props

```ts
interface PaPfDefectWizardProps {
  open: boolean;
  onClose: () => void;
  location: DefectLocation;         // 처리할 격리 항목
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}
```

### 처리 방식 3가지

| `action` | 레이블 | API |
|---|---|---|
| `unquarantine` | 정상 복귀 (잘못 격리) | `defectsApi.unquarantine()` — 즉시, 결재 불필요 |
| `scrap` | 전부 폐기 (BOM 통째) | `stockRequestsApi.createStockRequest({ request_type: "defect_scrap" })` — 결재 필요 |
| `disassemble` | 분해 + 자식 처리 | `stockRequestsApi.createStockRequest({ request_type: "defect_disassemble" })` — 결재 필요 |

### 단계별 흐름

1. 처리 방식 라디오 버튼 선택 (`unquarantine` / `scrap` / `disassemble`)
2. `disassemble` 선택 시 → `DisassembleTree` 표시 — 자식 품목별 처리(`ChildDecision[]`) 결정
3. 본인 사유 입력 (`ReasonFormFields`)
4. 제출 — `action`에 따라 API 분기

### 주요 상태

| 상태 | 설명 |
|---|---|
| `action` | 선택된 처리 방식 (기본값: `"disassemble"`) |
| `decisions` | BOM 자식 트리 결정 목록 (`ChildDecision[]`) |
| `category` / `memo` | 사유 카테고리 / 메모 |
| `busy` / `errorMsg` | 제출 중 / 에러 |

**제출 조건 (`canSubmit`):** `category` 비어있지 않음 + `busy` 아님.

**disassemble 제출 시** `decisions`를 JSON으로 직렬화하여 `notes` 필드에 포함:
```ts
notes: JSON.stringify({ child_decisions: childDecisions })
```

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/defects.ts]] — `defectsApi.unquarantine()` (정상 복귀)
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stockRequestsApi.createStockRequest()` (scrap/disassemble 결재)
- [[ERP/frontend/app/legacy/_components/_defect_hub/DisassembleTree.tsx]] — BOM 자식 처리 결정 트리 UI

> [!info]- 더 연결된 파일
> - [[ERP/frontend/lib/api/types/defects.ts]] — `DefectLocation`, `UnquarantinePayload`
> - [[ERP/frontend/app/legacy/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 공통 폼
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx]] — 이 위자드를 여는 부모

## 핵심 발췌

```tsx
// action별 API 분기
if (action === "unquarantine") {
  await defectsApi.unquarantine({ item_id, qty, dept, reason_category, reason_memo, actor_employee_id });
} else if (action === "scrap") {
  await stockRequestsApi.createStockRequest({
    requester_employee_id: currentEmployee.employee_id,
    request_type: "defect_scrap",
    notes: memo || null,
    lines: [{ item_id: location.item_id, quantity: location.quantity,
               from_bucket: "defective", from_department: location.department, to_bucket: "none" }],
  });
} else {
  // disassemble
  await stockRequestsApi.createStockRequest({
    request_type: "defect_disassemble",
    notes: JSON.stringify({ child_decisions: childDecisions }),
    lines: [{ item_id: location.item_id, quantity: location.quantity,
               from_bucket: "defective", from_department: location.department, to_bucket: "none" }],
  });
}
```
