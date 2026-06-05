---
type: file-explanation
source_path: "backend/app/routers/inventory/_tx_filters.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# _tx_filters.py — 거래 이력 필터·응답 빌더 헬퍼

## 이 파일은 뭐예요?

입출고 내역(거래 이력) 화면의 목록(list)·요약(summary)·내보내기(export)가 공통으로 쓰는 쿼리 필터 함수와 응답 빌더 함수, 그리고 그 함수들이 참조하는 상수(거래 종류 분류·라벨 매핑)를 모아 둔 보조 파일입니다. 실제 엔드포인트 로직은 `transactions.py` 에 남아 있고, 그 파일이 여기 함수들을 가져다 씁니다.

## 언제 보나요?

- 거래 이력 화면의 검색·부서·모델·공정·기간 필터가 실제로 어떤 SQL 조건으로 도는지 확인할 때
- 거래 한 줄의 "부서 라벨"·"구분(작업 종류)" 이 어떻게 결정되는지 따질 때
- 목록/요약/내보내기 결과가 서로 어긋날 때(같은 헬퍼를 쓰는지 점검)

## 중요한 내용 (주요 함수)

- `_apply_common_filters(...)` — list/summary 공통 필터를 한 번에 AND 로 덧붙임(구분·기간·아카이브·검색·부서·공정·모델).
- `_department_label_expr()` — 거래 한 건의 부서 라벨 식(부서계열→부서명, 창고계열→'창고', 그 외→'미상').
- `_operation_filter(...)` — 화면 표시 "구분" 기준 필터. `_SUBTYPE_OP`/`_TX_OP` 라벨 매핑으로 sub_type 과 transaction_type 을 하나의 라벨로 묶음.
- `_process_step_filter` / `_model_filter` / `_department_filter` — 공정 끝 1글자, 모델(코드 prefix↔심볼), 부서 라벨 필터.
- `_batch_name_map(...)` — operation_batch_id 집합 → (요청자명, 승인자명) 매핑. list 와 export 가 공유해 동일 규칙으로 채움.
- `_to_log_response(...)` — `TransactionLogResponse` 를 만들어 채우는 응답 빌더.

## 연결되는 파일

- [[ERP/backend/app/routers/inventory/transactions.py]] — 이 헬퍼들을 import 해 실제 엔드포인트를 구성하는 곳.
- [[ERP/backend/app/schemas/transaction.py]] — 빌더가 만들어 내는 `TransactionLogResponse` 정의.
- [[ERP/backend/app/models/transaction.py]] — 필터·라벨이 비추는 거래 로그 표와 거래 종류 Enum.

## 조심할 점

라벨/구분 매핑(`_SUBTYPE_OP`/`_TX_OP`)은 프론트(`historyBatchInterpreter.ts`·`historyShared.ts`)와 1:1 로 맞춰야 하는 단일 출처입니다. 한쪽만 바꾸면 화면 구분·필터가 어긋납니다. 모델 필터는 SQLite 의 `instr`/`substr` 에 의존하므로 운영 DB 가 SQLite 라는 전제가 깔려 있습니다.

## 핵심 발췌

```python
# /transactions/summary 카테고리 — 프론트 historyShared.ts 의 scope 멤버와 일치.
_SUMMARY_WAREHOUSE_TYPES = [RECEIVE, SHIP, TRANSFER_TO_PROD, TRANSFER_TO_WH]
_SUMMARY_DEPT_TYPES = [TRANSFER_DEPT, BACKFLUSH, PRODUCE, DISASSEMBLE]
```
