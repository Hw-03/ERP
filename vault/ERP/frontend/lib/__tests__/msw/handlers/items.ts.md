# items.ts

## 이 파일은 뭐예요?
MSW 테스트용 품목 API 핸들러로, 품목 목록 조회(공정 유형 필터 포함)·단건 조회·생성·수정·BOM 완성 상태 변경 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 품목 관리 화면이나 품목 선택 드롭다운을 포함하는 컴포넌트를 테스트할 때
- `process_type_code` 필터링 로직을 테스트할 때

## 중요한 내용
- `itemsHandlers` — export되는 핸들러 배열
- 샘플 품목: `샘플품목A(I001, PA)`, `샘플품목B(I002, PF)` 2개
- `GET /items?process_type_code=XX` — 해당 공정 코드로 필터링하여 반환
- `GET /items/:itemId` — 존재하지 않으면 404
- `PATCH /items/:itemId/bom-completion` — `{ completed: boolean }` 받아 `bom_completed` 반환
- 샘플에 `legacy_item_type`, `supplier`, `min_stock` 필드 포함(I001만)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/items.py]] — 이 핸들러가 mock하는 실제 품목 백엔드 라우터
