---
type: index
project: ERP
layer: frontend
source_path: frontend/app/operations/
status: active
tags:
  - erp
  - frontend
  - route
  - operations
aliases:
  - 작업 페이지
---

# frontend/app/operations

> [!summary] 역할
> `/operations` 경로 라우트. 창고 입출고 작업 화면.

## 관련 문서

- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]

---

## 쉬운 말로 설명

`/operations` URL. **입출고 작업** 페이지. 실무자가 가장 자주 쓰는 화면이며, 창고-부서 이관, 입고/출고 같은 일상 작업을 처리.

### 주요 작업
- 품목 선택 → 수량 입력 → 작업 버튼
- 입고 / 출고 / 창고→부서 / 부서→창고 / 부서간 이동 / 불량 등록

실제 UI: [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]

---

## FAQ

**Q. 대량 작업 가능한가?**
여러 품목 한 번에 선택 → 하나의 작업으로 묶어 처리 가능 (`DesktopRightPanel` + `SelectedItemsPanel`).

**Q. 실수로 입력했으면?**
이력(`/history`) 에서 해당 거래 확인 후 반대 거래(조정 또는 역방향 이관)로 수정. 감사 추적.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — 호출 API
- 재고 입출고 시나리오 ⭐

Up: [[frontend/app/app]]
