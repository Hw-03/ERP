# io_persist.py

## 이 파일은 뭐예요?

입출고 배치(IoBatch)·번들(IoBundle)·라인(IoLine)을 DB에 영속화하고, 응답 페이로드로 직렬화하는 서비스입니다.  
`io_draft`·`io_dispatch` 두 모듈이 이 파일의 헬퍼를 재사용합니다.

## 언제 보나요?

- 임시저장·제출 후 DB에 저장된 배치 구조가 이상할 때
- 응답 payload 직렬화 오류를 추적할 때

## 중요한 내용

- `_persist_batch(db, payload, ...)` — IoBatch + IoBundle + IoLine 생성·갱신
- `_batch_to_payload(batch)` — DB 객체 → API 응답 딕셔너리 변환
- `_load_requester(db, employee_id)` — 요청 직원 조회
- `APPROVAL_SUB_TYPES` — `io_preview`에서 재사용 (결재가 필요한 sub_type 집합)

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/io_preview.py]] — 헬퍼 원천
- [[ERP/backend/app/services/io_draft.py]] — 이 파일 재사용
- [[ERP/backend/app/services/io_dispatch.py]] — 이 파일 재사용
- [[ERP/backend/app/models/io_batch.py]] — IoBatch·IoBundle·IoLine 모델
