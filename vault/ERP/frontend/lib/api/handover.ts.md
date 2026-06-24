# handover.ts

## 이 파일은 뭐예요?
인수인계서 도메인의 API 클라이언트입니다. 인수인계서 생성·임시저장·제출·수신·조회·삭제를 담당하며, 백엔드 `/api/handovers` 라우터와 통신합니다.

## 중요한 내용
- `createHandover(payload)` — `POST /api/handovers` : 인수인계서 신규 생성
- `saveHandoverDraft(payload)` — `PUT /api/handovers/draft` : 임시저장(draft). `handover_id` 없으면 신규, 있으면 기존 draft 갱신
- `submitHandover(handoverId, payload)` — `POST /api/handovers/{id}/submit` : draft → submitted 상태 전환
- `deleteHandoverDraft(handoverId, authorEmployeeId)` — `DELETE /api/handovers/draft/{id}` : 본인 draft 폐기
- `listHandovers(params)` — `GET /api/handovers` : 작성자·수신부서 필터 목록
- `listHandoverInbox(actorEmployeeId)` — `GET /api/handovers/inbox` : 내 수신함 목록
- `countHandoverInbox(actorEmployeeId)` — `GET /api/handovers/inbox/count` : 수신함 미처리 건수
- `receiveHandover(handoverId, payload)` — `POST /api/handovers/{id}/receive` : 인수 확인(수신 처리)
- `getHandover(handoverId)` — `GET /api/handovers/{id}` : 단건 조회

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/handover.py]] — 백엔드 짝 (인수인계서 라우터)
- [[ERP/frontend/lib/api-core.ts]] — fetch 기반 (`fetcher`, `postJson`, `putJson`, `deleteJson`, `toApiUrl`)
- [[ERP/frontend/lib/api/types/📁_types]] — `Handover`, `HandoverCreatePayload`, `HandoverDraftPayload`, `HandoverSubmitPayload`, `HandoverReceivePayload` 타입 정의
