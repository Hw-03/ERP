---
type: file-explanation
source_path: "backend/app/schemas/stock_request.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# stock_request.py — 입출고 결재 요청 API 형식

## 이 파일은 뭐예요?

작업자가 자재를 옮기려고 결재를 올리는 흐름의 데이터 모양을 정의합니다. 장바구니(임시저장) → 제출 → 창고/부서 승인 또는 반려까지, 입출고 요청 한 건이 거치는 단계의 요청·응답 형식이 여기 모여 있습니다.

## 언제 보나요?

- 입출고 요청 작성/제출 화면이 서버에 무엇을 보내는지 확인할 때
- 요청이 지금 어떤 상태(대기/예약/승인/반려/취소/완료)인지, 그 칸이 어디서 오는지 볼 때
- 승인·반려·취소 버튼이 어떤 값(PIN 포함)을 보내는지 따질 때

## 중요한 내용 (주요 클래스)

- `StockRequestLineCreate` — 요청 한 줄. 어디서(`from_bucket`/`from_department`) 어디로(`to_bucket`/`to_department`) 몇 개.
- `StockRequestCreate` — 제출용 본 요청. 라인이 최소 1개 필요(`min_length=1`). `client_request_id` 로 중복 제출 방지.
- `StockRequestDraftUpsert` — 장바구니(DRAFT) 저장. 작성 도중이라 라인 0개도 허용.
- `StockRequestSubmitPayload` — 장바구니를 제출로 전환.
- `StockRequestActionRequest` — 승인/반려/취소 공통. `pin` 필수, `reason` 은 반려 때만.
- `StockRequestResponse` — 요청 전체 상태. 창고 승인(`approved_by_*`)·부서 승인(`department_approved_by_*`)·반려(`rejected_*`)·완료(`completed_at`) 정보와 라인 목록을 담습니다. `requires_warehouse_approval`/`requires_department_approval` 로 어떤 결재가 필요한지 표시.

## 연결되는 파일

- [[ERP/backend/app/models/stock_request.py]] — 이 형식이 비추는 실제 요청 표와 상태 Enum.
- [[ERP/backend/app/services/stock_requests.py]] — 상태 전이(예약/승인/반려) 업무 규칙.
- [[ERP/backend/app/routers/stock_requests.py]] — 이 형식을 입출력으로 쓰는 API 입구.
- [[ERP/backend/app/services/approval_rules.py]] — 어떤 이동에 창고/부서 결재가 필요한지 판정하는 단일 원천.

## 조심할 점

🔴 승인 흐름의 계약서라 high-risk 입니다. 상태 필드나 필수 항목을 바꾸면 결재함 화면·승인 버튼·OpenAPI 문서가 함께 흔들립니다. 결재 필요 여부 판단 자체는 여기가 아니라 `approval_rules.py` 에 있으니, 형식만 보고 결재 규칙을 추측하지 마세요.

## 핵심 발췌

```python
class StockRequestActionRequest(BaseModel):
    """승인/반려/취소 공통 페이로드 — pin 필수."""
    actor_employee_id: uuid.UUID
    pin: str = Field(..., min_length=1, max_length=32)
    reason: Optional[str] = None  # reject 시에만 사용
```
