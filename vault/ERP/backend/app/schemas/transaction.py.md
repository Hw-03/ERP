---
type: file-explanation
source_path: "backend/app/schemas/transaction.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# transaction.py — 거래 로그·수정 API 형식

## 이 파일은 뭐예요?

재고를 바꾼 모든 동작(입고/출고/이동/불량/생산 등)이 남기는 거래 로그 한 줄의 응답 모양과, 그 로그의 메타정보·수량을 사후 보정할 때의 요청 모양을 정의합니다. 입출고 내역(History) 화면이 이 형식을 씁니다.

## 언제 보나요?

- 입출고 내역 화면의 한 줄에 무엇이 보이는지(품목·수량 변화·요청자·승인자·비고) 확인할 때
- 거래의 비고/참조번호/처리자를 수정하거나 수량을 보정하는 요청 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `TransactionLogResponse` — 거래 한 줄. `quantity_change`(증감)와 `quantity_before`/`quantity_after`, 요청자(`requester_name`)·승인자(`approver_name`), `operation_batch_id`, 수정 이력 개수(`edit_count`)를 담습니다.
- `TransactionMetaEditRequest` — 비고/참조번호/처리자 수정. `reason` 과 PIN(`edited_by_pin`) 필수.
- `TransactionQuantityCorrectionRequest` — RECEIVE/SHIP 수량 보정. SHIP 은 `quantity_change` 가 음수여야 함.
- `TransactionQuantityCorrectionResponse` — 보정 결과(원본 + 보정 거래 한 쌍).
- `TransactionEditLogResponse` — 수정 감사 한 줄(누가·언제·전후 payload).
- `TransactionLogUpdate` — [Deprecated] notes 만 수정하던 구버전.

## 연결되는 파일

- [[ERP/backend/app/models/transaction.py]] — 이 형식이 비추는 실제 거래 로그·수정 감사 표.
- [[ERP/backend/app/routers/inventory/transactions.py]] — 이 형식을 입출력으로 쓰는 거래 이력 API.
- [[ERP/backend/app/routers/inventory/_tx_filters.py]] — `TransactionLogResponse` 를 만들어 채우는 응답 빌더(`_to_log_response`).
- [[ERP/backend/app/schemas/📁_schemas]] — 같은 패키지 형제들.

## 조심할 점

승인자(`approver_name`)는 "요청을 수락한 사람" 이고, 직접 처리(자동결재/즉시처리)면 요청자와 같아 별도 승인자가 비는 규칙이 있습니다. 화면 라벨이 실제 처리와 어긋났던 이력이 있으니(History E2E 검수) 필드 의미를 임의 해석하지 마세요.

## 핵심 발췌

```python
class TransactionLogResponse(BaseModel):
    transaction_type: TransactionTypeEnum
    quantity_change: int
    requester_name: Optional[str] = None
    approver_name: Optional[str] = None   # 직접 처리 시 = 요청자
    operation_batch_id: Optional[uuid.UUID] = None
    edit_count: int = 0
```
