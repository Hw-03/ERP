# handover.ts

## 이 파일은 뭐예요?
인수인계서 도메인의 TypeScript 타입 정의 파일입니다. draft → submitted → received 상태 전환과 품목 라인 목록을 담는 구조를 정의합니다.

## 언제 보나요?
- 인수인계서 작성/제출/수령 기능을 수정할 때
- 인수인계서 상태(`HandoverStatus`), 라인 구조, 페이로드 모양을 확인해야 할 때

## 중요한 내용
- `HandoverStatus` — `"draft"` | `"submitted"` | `"received"` 3단계
- `HandoverLine` — 품목 라인 1건. `mes_code_snapshot`으로 코드명을 스냅샷 보관
- `Handover` — 인수인계서 전체 응답 객체. `from_department` / `to_department`로 부서 간 이동 기록
- `HandoverCreatePayload` — 새 인수인계서 생성 요청 본문
- `HandoverDraftPayload` — draft 신규/갱신 요청. `handover_id` 없으면 신규, 있으면 덮어쓰기
- `HandoverSubmitPayload` — draft → submitted 전환 요청 (작성자 ID 포함)
- `HandoverReceivePayload` — submitted → received 전환 요청 (수령자 PIN 포함)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/index.ts]] — 전체 타입 barrel (handover 타입 포함 — `export type * from "./handover"` 로 re-export됨)
- [[ERP/backend/app/routers/handover.py]] — 인수인계서 CRUD·상태전환 백엔드 API
