# 📁 handlers

## 이 폴더는 뭐예요?
MSW(Mock Service Worker) 테스트에서 사용하는 API 핸들러 모음입니다. 각 파일이 도메인별(품목·재고·BOM·직원·설정 등) 백엔드 엔드포인트를 가짜 응답으로 흉내 내어, 실제 서버 없이 프론트엔드 컴포넌트와 훅을 테스트할 수 있게 해 줍니다.

## 언제 여기를 보나요?
- 프론트엔드 단위/통합 테스트가 실패했을 때 어떤 API 응답을 반환하는지 확인할 때
- 새 API 엔드포인트 추가 후 대응하는 MSW 핸들러를 추가해야 할 때
- PIN 검증, 404, 422 같은 에러 경로가 테스트에서 제대로 처리되는지 확인할 때

## 주요 파일
- `items.ts` — 품목 목록·단건·생성·수정·BOM 완성 상태 핸들러
- `inventory.ts` — 재고 요약·위치·입고·조정·이동·불량 처리 핸들러
- `transactions.ts` — 트랜잭션 이력·월별 건수·편집·수량 보정 핸들러
- `bom.ts` — BOM 목록·트리·역방향 조회·CRUD 핸들러
- `stock-requests.ts` — 출고 요청 워크플로(draft→submit→approve/reject) 핸들러
- `departments.ts` — 부서 CRUD·순서 변경 핸들러
- `employees.ts` — 직원 CRUD·PIN 초기화 핸들러
- `models.ts` — 기종 CRUD·순서 변경 핸들러
- `settings.ts` — PIN 검증·변경·DB 초기화·감사 CSV 핸들러
- `admin.ts` — 어드민 PIN 검증·감사 CSV 핸들러(settings.ts와 일부 중복)
- `production.ts` — 생산 가능 수량·BOM 체크·생산 입고 핸들러

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/__tests__/msw/📁_msw]] — 이 핸들러들을 조합하는 MSW 서버 setup 파일
