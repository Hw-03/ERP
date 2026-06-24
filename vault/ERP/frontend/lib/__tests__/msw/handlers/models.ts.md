# models.ts

## 이 파일은 뭐예요?
MSW 테스트용 모델(기종) CRUD API 핸들러로, 기종 목록 조회·생성·수정·삭제·순서 변경 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 기종 관리 화면 컴포넌트를 테스트할 때
- 기종 삭제 시 헤더(`X-Admin-Pin`) 또는 body pin 두 방식을 모두 테스트할 때

## 중요한 내용
- `modelsHandlers` — export되는 핸들러 배열
- 샘플 데이터: `DX3000(slot=1, symbol=A)`, `COCOON(slot=2, symbol=B)` 2개 기종
- `DELETE` — `X-Admin-Pin` 헤더 또는 body `pin` 둘 다 `"0000"` 허용, 누락 시 400
- `PUT`, `PATCH /reorder` — body pin `"0000"` 필수, 불일치 시 403
- `slot` 기반 식별자(숫자)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 핸들러가 mock하는 실제 기종 관리 UI
