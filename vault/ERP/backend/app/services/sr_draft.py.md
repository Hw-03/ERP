# sr_draft.py

## 이 파일은 뭐예요?

결재 요청(StockRequest)의 드래프트(장바구니) 상태 관리 서비스입니다.  
요청 라인 추가·수정·삭제와 제출 전 임시저장을 담당합니다.

## 언제 보나요?

- 결재 요청 작성 중 저장이 안 되거나 내용이 틀렸을 때
- 요청 상태가 `draft` → `submitted` 전환이 이상할 때

## 중요한 내용

- `create_draft(db, employee, lines, ...)` — 새 StockRequest(draft) 생성
- `update_draft(db, request_id, lines, ...)` — 기존 draft 라인 수정
- `submit_draft(db, request_id)` — draft → submitted 상태 전환

`sr_validation`의 검증 함수를 호출해 라인 유효성을 먼저 확인합니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/sr_validation.py.md]] — 검증 로직
- [[ERP/backend/app/routers/stock_requests.py.md]] — 결재 요청 API
- [[ERP/backend/app/models/stock_request.py.md]] — StockRequest 모델
