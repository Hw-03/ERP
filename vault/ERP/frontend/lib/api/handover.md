# handover.ts

## 이 파일은 뭐예요?
인수인계서 도메인 API 모듈입니다. 생성·임시저장·제출·삭제·목록·수신함·수신 확인 등 인수인계서 전체 생명주기를 다루는 9개 메소드를 제공합니다.

## 언제 보나요?
- 인수인계서 작성·제출·수신 화면을 개발하거나 디버깅할 때
- draft → submit → receive 상태 전이 흐름을 추적할 때

## 중요한 내용
- `handoverApi.createHandover(payload)` — 신규 인수인계서
- `handoverApi.saveHandoverDraft(payload)` — 임시저장(handover_id 없으면 신규 draft)
- `handoverApi.submitHandover(handoverId, payload)` — draft → submitted
- `handoverApi.deleteHandoverDraft(handoverId, authorEmployeeId)` — 본인 draft만 삭제
- `handoverApi.listHandovers(params)` — 작성자·수신부서 필터
- `handoverApi.listHandoverInbox(actorEmployeeId)` — 수신함 목록
- `handoverApi.countHandoverInbox(actorEmployeeId)` — 수신함 건수
- `handoverApi.receiveHandover(handoverId, payload)` — 수신 확인
- `handoverApi.getHandover(handoverId)` — 단건 조회
- 타입: `Handover`, `HandoverCreatePayload`, `HandoverDraftPayload`, `HandoverReceivePayload`, `HandoverSubmitPayload` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/handover.ts]] — 인수인계서 타입
- [[ERP/backend/app/routers/handover.py]] — 백엔드 인수인계 라우터
