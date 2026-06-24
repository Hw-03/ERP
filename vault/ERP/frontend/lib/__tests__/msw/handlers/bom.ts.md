# bom.ts

## 이 파일은 뭐예요?
MSW 테스트용 BOM(부품 구성표) API 핸들러로, BOM 목록·트리·역방향 조회(where-used)·CRUD 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- BOM 관리 화면이나 BOM 트리 뷰어를 테스트할 때
- `where-used` 역방향 조회 기능을 테스트할 때

## 중요한 내용
- `bomHandlers` — export되는 핸들러 배열
- `BOMDetailEntry`, `BOMEntry`, `BOMTreeNode` 타입을 `@/lib/api/types/catalog`에서 import
- 샘플 BOM: `완제품A(FA-001)` → `부품X(PX-001)` 2개, `부품Y(PY-002)` 1개
- `GET /bom/:parentId/tree` — `parent-1`이 아니면 404 반환
- `GET /bom/:parentId` — `parent-1`이면 `[sampleBomEntry]`, 그 외 빈 배열
- BOM 트리 노드에 `process_type_code`, `required_quantity`, `current_stock` 포함

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/catalog.ts]] — `BOMDetailEntry`, `BOMEntry`, `BOMTreeNode` 타입 정의
