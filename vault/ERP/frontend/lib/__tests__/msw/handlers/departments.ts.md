# departments.ts

## 이 파일은 뭐예요?
MSW 테스트용 부서 CRUD API 핸들러로, 부서 목록 조회·생성·수정·삭제·순서 변경 엔드포인트를 가짜 응답으로 제공합니다. PIN 검증 로직도 포함합니다.

## 언제 보나요?
- 부서 관리 화면(`AdminDepts`) 관련 컴포넌트나 훅을 테스트할 때
- PIN 인증이 포함된 부서 CRUD 플로우를 테스트할 때

## 중요한 내용
- `departmentsHandlers` — export되는 핸들러 배열
- 샘플 데이터: `AS1`(id=1, io_enabled=true), `AS2`(id=2, io_enabled=false) 2개 부서
- `POST`, `PUT`, `PATCH /reorder` — PIN `"0000"` 필수, 불일치 시 403
- `DELETE` — 요청 body에서 pin 파싱, 누락 시 400
- `io_enabled` 필드가 샘플에 포함되어 있어 입출고 활성화 기능 테스트 가능

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 핸들러가 mock하는 실제 부서 관리 UI
