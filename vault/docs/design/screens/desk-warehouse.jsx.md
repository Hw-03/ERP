---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-warehouse.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
  - warehouse
aliases:
  - 창고 화면 시안
---

# screens/desk-warehouse.jsx

> [!summary] 역할
> ERP 리디자인의 **창고 입출고 화면** React 시안.
> 창고 입출고 작업 흐름과 검색 패널을 포함한다.

> [!info] 관련 스크린샷
> - `desk_05_warehouse_io`, `desk_06_warehouse_search`

---

## 쉬운 말로 설명

**"데스크탑 창고 화면 시안"**. 창고 입출고 (입고 / 출고 / 이동) 작업을 하는 흐름과, 품목을 찾기 위한 검색 패널을 그려둔 시안. 실제 운영 화면은 `DesktopWarehouseView.tsx` 에 있다.

## FAQ

**Q. 창고 입출고 단위는?**
창고 ↔ 부서, 또는 외부 ↔ 창고. 부서 간 이동은 부서 화면에서 처리.

**Q. 시안과 실제 화면이 다르다면?**
실제 구현이 기준. 시안은 초기 컨셉이라 일부 필드/버튼이 빠지거나 바뀐 경우 많다.

---

## 관련 문서

- [[docs/design/screens/desk-dashboard.jsx.md]] — 대시보드 시안
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — 실제 구현

Up: [[docs/design/design]]
