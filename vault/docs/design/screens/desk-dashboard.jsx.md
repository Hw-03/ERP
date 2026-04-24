---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-dashboard.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
  - dashboard
aliases:
  - 대시보드 화면 시안
---

# screens/desk-dashboard.jsx

> [!summary] 역할
> ERP 리디자인의 **대시보드 화면** React 시안.
> KPI 카드, 부족 현황, 모델 필터, 상세 패널을 포함하는 대시보드 레이아웃.

> [!info] 관련 스크린샷
> - [[docs/design/design]] 의 `desk_01_dashboard` ~ `desk_04_dashboard_detail_panel`

---

## 쉬운 말로 설명

**"데스크탑 대시보드 시안 스케치"**. KPI 카드 (총 재고, 부족 품목, 대기 배치 등), 부족 현황 리스트, 모델별 필터, 선택 시 나오는 상세 패널을 그림으로 그려둔 것. 실제 동작은 데이터 없이 mock 기반.

## FAQ

**Q. 실제 대시보드 코드는 어디?**
현재 프로덕션 대시보드는 별도 페이지 없이 `legacy/page.tsx` 중심으로 흘러간다. 리디자인이 머지되면 여기가 기준이 될 예정.

**Q. KPI 지표는 어디서 오는가?**
시안에는 mock 값 들어감. 실제 연결 시엔 `GET /items?category=...` 기반 집계 + `pending_quantity` 합계 사용.

---

## 관련 문서

- [[docs/design/screens/desk-warehouse.jsx.md]] — 창고 화면 시안
- [[docs/design/screens/desk-admin.jsx.md]] — 관리자 화면 시안

Up: [[docs/design/design]]
