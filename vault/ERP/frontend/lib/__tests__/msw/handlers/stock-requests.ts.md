# stock-requests.ts

## 이 파일은 뭐예요?
MSW 테스트용 재고 요청(출고 요청) API 핸들러로, 창고 대기열·부서 대기열·요청 CRUD·승인/반려/취소/제출/임시저장 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 출고 요청 워크플로(draft → submit → approve/reject) 전체 플로우를 테스트할 때
- 창고 대기열(`warehouse-queue`) 또는 부서 대기열(`department-queue`) UI를 테스트할 때

## 중요한 내용
- `stockRequestsHandlers` — export되는 핸들러 배열
- 샘플: `request_id: "req-1"`, `status: "pending_warehouse"`, `lines: []`
- `POST /approve`, `POST /reject` — PIN `"0000"` 필수, 불일치 시 403
- `POST /cancel`, `POST /submit` — PIN 검증 없음
- `PUT /draft` — 임시저장(기존 draft 갱신), `DELETE /draft/:id` — 204 반환
- `GET /warehouse-queue/count` — `{ count: 2 }` 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/stock_requests.py]] — 이 핸들러가 mock하는 실제 백엔드 라우터
