---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-history.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
  - history
aliases:
  - 이력 화면 시안
---

# screens/desk-history.jsx

> [!summary] 역할
> ERP 리디자인의 **거래 이력 화면** React 시안.
> 이력 목록, 필터 패널을 포함한다.

> [!info] 관련 스크린샷
> - `desk_07_history`, `desk_08_history_filtered`

---

## 쉬운 말로 설명

**"입출고 이력 화면 시안"**. 모든 거래를 시간 순으로 나열하고, 날짜 / 타입 (IN/OUT/MOVE/SCRAP/LOSS) / 품목 필터를 걸 수 있는 화면. 실제 운영 화면은 `DesktopHistoryView.tsx`.

## FAQ

**Q. 이력이 쌓이는 곳은?**
DB `transactions` 테이블. 입출고/이동/불량 모두 동일 테이블에 type 컬럼으로 구분.

**Q. 오래된 이력은 삭제되나?**
자동 삭제 없음. 필요 시 백업 후 수동 정리.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]] — 실제 구현

Up: [[docs/design/design]]
