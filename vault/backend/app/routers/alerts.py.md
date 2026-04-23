---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/alerts.py
status: active
tags:
  - erp
  - backend
  - router
  - alerts
aliases:
  - 알림 라우터
  - 안전재고 알림 API
---

# alerts.py

> [!summary] 역할
> 안전재고 이하로 떨어진 품목에 대한 알림을 생성하고 관리하는 API.

> [!info] 주요 책임
> - `POST /api/alerts/scan` — 전체 품목 스캔 후 안전재고 미달 항목 알림 생성
> - `GET /api/alerts/` — 알림 목록 조회 (종류·확인여부·품목 필터)
> - `POST /api/alerts/{alert_id}/acknowledge` — 알림 확인 처리

> [!warning] 주의
> - 알림 종류: `SAFETY`(안전재고 미달), `COUNT_VARIANCE`(실물 조사 차이)
> - 확인(acknowledge)하지 않은 알림은 계속 표시됨

---

## 쉬운 말로 설명

이 라우터는 **"재고 관련 경고 게시판"**이다. 배경으로 도는 게 아니라 **필요할 때 수동 스캔**(`POST /scan`)으로 `SAFETY` 알림을 만들고, 실사 차이는 `counts` 라우터가 호출될 때 자동 생성.

### 알림 2종
- **SAFETY** — 가용재고 < `items.min_stock`. 스캔 시 감지.
- **COUNT_VARIANCE** — 실사량이 시스템 수량과 다를 때. `/counts` 제출 시 자동.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/alerts/scan` | POST | 안전재고 전수 스캔 → 신규 SAFETY 알림 |
| `/api/alerts` | GET | 알림 목록 (kind, include_acknowledged, item_id 필터) |
| `/api/alerts/{alert_id}/acknowledge` | POST | 확인 처리 (담당자 이름 기록) |

### 스캔 로직
```
for item where min_stock IS NOT NULL:
  avail = available(inv)
  if avail < min_stock:
    if 미확인 SAFETY 알림 이미 있음: skip
    else: StockAlert(SAFETY, threshold=min_stock, observed=avail, message=...)
```
→ 중복 방지: 같은 품목이 이미 미확인이면 새 행 안 만듦.

### 확인
```json
POST /api/alerts/{id}/acknowledge
{ "acknowledged_by": "김현우" }
```
→ `acknowledged_at`, `acknowledged_by` 기록. 이미 확인됨이면 400.

---

## FAQ

**Q. 스캔은 누가 언제 호출?**
프론트가 `/alerts` 페이지 진입 시 또는 주기적으로 호출. 자동 cron 없음.

**Q. 확인 후 다시 떨어지면?**
확인된 알림은 그대로 남고, 다시 재고가 미달이면 **새 SAFETY 알림**이 생성된다 (미확인 기준으로 중복 체크).

**Q. `include_acknowledged=false` 기본값?**
YES. 기본은 **미확인**만 표시. 확인된 이력까지 보려면 쿼리 추가.

**Q. threshold 바꾸면 기존 알림은?**
영향 없음. 기존 알림의 `threshold`는 발생 당시 값. 다음 스캔에서 새 값 기준.

**Q. `observed_value`가 음수?**
이론상 가능. `available = wh + production - pending`이라 `pending`이 커서 가용이 음수일 수 있음.

---

## 관련 문서

- [[backend/app/routers/counts.py.md]] — COUNT_VARIANCE 자동 생성 경로
- [[backend/app/routers/items.py.md]] — `min_stock` 설정
- [[backend/app/services/inventory.py.md]] — `available()` 함수
- [[backend/app/models.py.md]] — `StockAlert`
- [[frontend/app/alerts/alerts]]

Up: [[backend/app/routers/routers]]
