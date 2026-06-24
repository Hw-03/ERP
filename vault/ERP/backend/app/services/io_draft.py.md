# io_draft.py

## 이 파일은 뭐예요?

입출고 임시저장(draft) CRUD와 **멱등 재제출 응답**을 담당하는 서비스입니다.  
`io_persist`의 `_persist_batch`·`_batch_to_payload`·`_load_requester`를 재사용합니다.

## 언제 보나요?

- 임시저장 후 복원이 안 되거나 데이터가 틀렸을 때
- "이미 제출된 draft" 처리 흐름을 파악할 때

## 중요한 내용

- `save_draft(db, payload)` — draft IoBatch 생성·갱신
- `get_draft(db, employee_id)` — 현재 직원의 draft 조회
- `delete_draft(db, batch_id)` — draft 삭제
- 이미 제출된 배치에 save_draft가 들어오면 기존 응답을 멱등으로 반환

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/io_persist.py.md]] — 영속화 헬퍼
- [[ERP/backend/app/routers/io.py.md]] — draft API 진입점
- [[ERP/frontend/app/mes/_components/_warehouse_v2/📁__warehouse_v2.md]] — 프론트 임시저장 훅
