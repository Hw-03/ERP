---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/counts.py
status: active
tags:
  - erp
  - backend
  - router
  - counts
aliases:
  - 실물 조사 라우터
  - 재고 실사 API
---

# counts.py

> [!summary] 역할
> 실물 재고 조사(Physical Count)를 기록하고 조회하는 API.
> 시스템 수량과 실제 수량 차이를 추적한다.

> [!info] 주요 책임
> - `POST /api/counts/` — 실물 조사 결과 등록 (실수량, 시스템수량, 차이 자동 계산)
> - `GET /api/counts/` — 조사 이력 조회 (품목 필터)

> [!warning] 주의
> - 실물 조사 등록 시 `COUNT_VARIANCE` 알림이 자동 생성될 수 있음

---

## 쉬운 말로 설명

**실물 조사(physical count)** = 실제 창고를 돌면서 "시스템엔 10개인데 진짜 몇 개?" 확인하는 작업. 이 라우터는 그 결과를 기록하고, **시스템 재고를 실측치로 강제 조정**한다.

대상은 **창고(warehouse_qty)만**. 부서별 실사는 별도 흐름 (추후).

---

## 엔드포인트

### `POST /api/counts` — 실사 등록 + 강제 조정

요청:
```json
{
  "item_id": "...",
  "counted_qty": 7,
  "reason": "월말 실사 — 창고 A구역",
  "operator": "김현우"
}
```

내부 처리:
```
1. system_qty = inv.warehouse_qty
2. diff = counted - system_qty
3. if counted < pending_quantity:
     → 422 (예약분보다 적을 수 없음)
4. PhysicalCount 행 생성
5. if diff ≠ 0:
     - inv.warehouse_qty = counted_qty
     - TransactionLog(ADJUST, diff)
     - StockAlert(COUNT_VARIANCE, observed=diff, message=...)
6. commit
```

### `GET /api/counts` — 이력

| 파라미터 | |
|---------|---|
| `item_id` | 특정 품목만 |
| `skip`, `limit` | 페이징 |

최신순 정렬.

---

## FAQ

**Q. 왜 창고만 대상?**
현 구현은 창고 재고만 실사. 부서(`inventory_locations`)는 별도 실사 흐름이 아직 없음. 필요하면 `mark-defective`나 `adjust` 경로로 수기 보정.

**Q. 실사량이 예약보다 적으면?**
422 오류. 이미 누가 예약해놓은 재고는 못 빼니, 예약을 먼저 풀어라 (`queue cancel`).

**Q. `diff=0`이면?**
`PhysicalCount` 행만 남기고 조정·알림 없음. 단순 "확인 완료" 기록.

**Q. `COUNT_VARIANCE` 알림 임계치?**
|diff| > 0이면 무조건 생성. 임계값 설정은 없음.

**Q. 연속 실사?**
계속 POST 가능. 매번 새 행. 직전 실사보다 수량 늘어도 OK.

---

## 관련 문서

- [[backend/app/routers/alerts.py.md]] — `COUNT_VARIANCE` 알림 수신
- [[backend/app/services/inventory.py.md]] — `_sync_total()` 동기화
- [[backend/app/models.py.md]] — `PhysicalCount`
- [[frontend/app/counts/counts]]
- 재고 입출고 시나리오

Up: [[backend/app/routers/routers]]
