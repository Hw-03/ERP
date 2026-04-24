---
type: index
project: ERP
layer: frontend
source_path: frontend/app/alerts/
status: active
tags:
  - erp
  - frontend
  - route
  - alerts
aliases:
  - 알림 페이지 라우트
---

# frontend/app/alerts

> [!summary] 역할
> `/alerts` 경로 라우트. 안전재고 미달 알림 목록 화면.

## 관련 문서

- [[backend/app/routers/alerts.py.md]]
- [[frontend/app/legacy/_components/AlertsBanner.tsx.md]]

---

## 쉬운 말로 설명

`/alerts` URL. **안전재고 미달** 같은 경고를 한 곳에 모아 보여주는 페이지.

### 언제 경고가 뜨나?
1. 품목의 `safety_stock` 값보다 `available` 수량이 낮아졌을 때
2. 실사(Physical Count)에서 시스템 수량과 실제 차이가 클 때 (COUNT_VARIANCE)
3. 관리자가 `POST /api/alerts/scan` 실행하면 한 번에 재평가

### 상태
- **신규** — 아직 확인 안 된 경고
- **승인(acknowledged)** — 관리자가 확인해서 표시만 남김

---

## FAQ

**Q. 경고는 자동으로 뜨나?**
스캔 API 호출 시마다 재계산. 실시간 감지는 아니며, 배치성으로 평가.

**Q. 경고 사라지게 하려면?**
재고 보충 후 재스캔하거나, `acknowledge` 처리.

---

## 관련 문서

- [[backend/app/routers/counts.py.md]] — COUNT_VARIANCE 관련
- 재고 입출고 시나리오

Up: [[frontend/app/app]]
