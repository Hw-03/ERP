# catalog.ts

## 이 파일은 뭐예요?
마스터 데이터(제품 모델·BOM) API 모듈입니다. 모델 CRUD·순서 변경 5개, BOM 조회·생성·수정·삭제 7개로 총 10개 메소드를 제공합니다.

## 언제 보나요?
- 제품 모델 관리 화면을 개발하거나 모델 목록을 조회할 때
- BOM 구성(부품 구성표) 편집, BOM 트리 펼치기, where-used 조회를 구현할 때

## 중요한 내용
- `catalogApi.getModels()` — `/api/models`, `ProductModel[]`
- `catalogApi.createModel` — 모델 생성 (PIN 불필요)
- `catalogApi.updateModel / deleteModel / reorderModels` — 모델 수정·삭제·정렬 (PIN 필수)
- `catalogApi.getAllBOM()` — 전체 BOM, `BOMDetailEntry[]`
- `catalogApi.getBOM(parentItemId)` — 특정 품목의 직속 BOM
- `catalogApi.getBOMTree(parentItemId)` — BOM 트리 재귀 조회, `BOMTreeNode`
- `catalogApi.getBOMWhereUsed(itemId)` — 해당 품목을 자식으로 쓰는 BOM 행(1단계)
- `catalogApi.createBOM / deleteBOM / updateBOM` — BOM 행 CRUD
- 타입: `BOMDetailEntry`, `BOMEntry`, `BOMTreeNode`, `ProductModel` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/catalog.ts]] — 카탈로그 타입 정의
- [[ERP/backend/app/routers/models.py]] — 모델 라우터
- [[ERP/backend/app/routers/bom.py]] — BOM 라우터
