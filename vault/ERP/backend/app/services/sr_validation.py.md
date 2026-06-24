# sr_validation.py

## 이 파일은 뭐예요?

결재 요청(StockRequest) 제출 전 검증 함수와 정책 상수 모음입니다.

## 언제 보나요?

- 결재 요청 제출 시 422 오류가 나거나 검증 메시지가 이상할 때
- preflight 재고 확인 로직을 파악할 때

## 중요한 내용

- `_validate_lines(lines, ...)` — 라인 shape·수량 검증
- `_preflight_inventory_check(db, lines, ...)` — 요청 수량이 가용 재고를 초과하는지 사전 확인
- `_generate_request_code()` — 요청 코드 자동 생성
- `LineInput` — 요청 라인 입력 데이터클래스
- `_TX_TYPE_BY_REQUEST` — 요청 유형 → 거래 타입 매핑 (sr_execution이 재사용)

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/sr_draft.py.md]] — 이 검증을 호출하는 draft 서비스
- [[ERP/backend/app/services/stock_math.py.md]] — 가용 재고 계산

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/models/stock_request.py.md]]
