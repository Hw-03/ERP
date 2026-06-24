# io.ts

## 이 파일은 뭐예요?
입출고(IO) 배치 처리 API 모듈입니다. 미리보기·임시저장·조회·제출·삭제 등 입출고 배치 전체 생명주기를 다루는 8개 메소드를 제공합니다.

## 언제 보나요?
- 입출고 화면의 preview → draft → submit 흐름을 개발하거나 디버깅할 때
- 직원별 draft 목록 조회나 특정 draft 삭제 로직을 볼 때
- `ioApi` 메소드 시그니처가 필요할 때

## 중요한 내용
- `ioApi.preview(payload)` — `/api/io/preview`, `IoPreviewResponse` 반환
- `ioApi.saveDraft(payload)` — `/api/io/draft` PUT, `IoBatch` 반환
- `ioApi.getDraft(employeeId, workType, subType?)` — 단일 draft 조회
- `ioApi.listDrafts(employeeId)` — 직원의 전체 draft 목록, `IoBatch[]`
- `ioApi.deleteDraft(batchId, employeeId)` — draft 삭제
- `ioApi.submit(payload)` — 즉시 제출(draft 없이), `IoSubmitResponse`
- `ioApi.submitDraft(batchId, employeeId)` — 저장된 draft → 제출
- `ioApi.getBatch(batchId)` — 배치 단건 조회
- 타입: `IoBatch`, `IoDraftPayload`, `IoPreviewPayload`, `IoPreviewResponse`, `IoSubmitResponse`, `IoWorkType` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/io.ts]] — IO 관련 타입 정의
- [[ERP/backend/app/routers/io.py]] — 백엔드 IO 라우터
- [[ERP/frontend/lib/api-core.ts]] — deleteJson, fetcher, postJson, putJson
