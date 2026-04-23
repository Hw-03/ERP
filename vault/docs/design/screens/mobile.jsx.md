---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/mobile.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
  - mobile
aliases:
  - 모바일 화면 시안
---

# screens/mobile.jsx

> [!summary] 역할
> ERP 리디자인의 **모바일 화면** React 시안.
> 재고 조회, 창고 입출고, 부서별 관리, 관리자 탭 등 모바일 레이아웃.

> [!info] 관련 스크린샷 (uploads/mob_*)
> - `mob_01_inventory` ~ `mob_12_admin_settings` (12장)

---

## 쉬운 말로 설명

**"핸드폰 화면용 시안"**. 데스크탑과 달리 하단 탭바 (재고 / 창고입출고 / 부서입출고 / 이력 / 관리자) 로 이동. 창고 직원이 현장에서 바코드 스캔하며 쓰는 것을 상정.

## 주요 탭

- **재고 (InventoryTab)**: 카테고리별 현재고 조회, 바코드 스캔 지원
- **창고 입출고 (WarehouseIOTab)**: 창고↔부서, 창고 입고 모드
- **부서 입출고 (DeptIOTab)**: 부서 기준 입출고
- **이력 (HistoryTab)**: 최근 거래 리스트
- **관리자 (AdminTab)**: PIN 통과 후 품목/직원/BOM/패키지/설정

## FAQ

**Q. 반응형 분기점은?**
1024px 미만에서 모바일 레이아웃. `legacy/page.tsx` 가 자동 분기.

**Q. 바코드 스캔은 실제로 되는가?**
Web BarcodeDetector API 지원 브라우저에서 동작 (크롬 모바일 등).

---

## 관련 문서

- [[frontend/app/legacy/_components/InventoryTab.tsx.md]] — 모바일 재고 탭 구현
- [[frontend/app/legacy/_components/AdminTab.tsx.md]] — 모바일 관리자 탭 구현

Up: [[docs/design/design]]
