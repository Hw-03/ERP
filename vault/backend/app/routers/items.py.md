---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/items.py
status: active
tags:
  - erp
  - backend
  - router
aliases:
  - 품목 라우터
  - items.py
---

# items.py

> [!summary] 역할
> 품목 마스터 CRUD와 품목 검색/필터/내보내기를 담당하는 라우터.
> 이번 브랜치에서는 재고 수치 계산과 모델 슬롯/ERP 코드 조합까지 함께 다루는 관문 역할이 더 커졌다.

## 쉬운 말로 설명

품목을 만들고, 찾고, 수정하는 API가 모여 있는 파일이다.  
예전보다 "품목 자체 정보"만 보는 게 아니라, 재고 수치와 모델 슬롯까지 합쳐서 화면에 넘겨주는 중심 라우터로 이해하면 된다.

## 핵심 책임

- 품목 생성/수정/조회/CSV 내보내기
- 카테고리, 부서, 바코드, 레거시 분류 기준 필터링
- `ItemWithInventory` 형태로 재고 수치까지 묶어서 응답
- `stock_math`, `inventory` 서비스와 연결된 품목 DTO 조립

## 주의점

- ERP 코드와 모델 슬롯은 `erp_code.py`, `ProductSymbol`, `ItemModel` 과 함께 봐야 흐름이 잡힌다.
- 화면에서 보이는 재고 수치는 단순 `Inventory.quantity` 하나가 아니라 계산된 수치일 수 있다.

## 관련 문서

- [[backend/app/services/stock_math.py.md]]
- [[backend/app/utils/erp_code.py.md]]
- [[frontend/lib/api.ts.md]]

Up: [[backend/app/routers/routers]]

