---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/scrap.py
status: active
tags:
  - erp
  - backend
  - router
  - scrap
aliases:
  - 스크랩 라우터
  - 불량 처리 API
---

# scrap.py

> [!summary] 역할
> 불량·폐기 처리(Scrap) 기록을 남기는 API. 생산 과정에서 발생한 불량품을 기록한다.

> [!info] 주요 책임
> - `POST /api/scrap/` — 스크랩 기록 등록 (품목, 수량, 공정 단계, 사유)
> - `GET /api/scrap/` — 스크랩 목록 조회 (품목·배치 필터)

---

## 쉬운 말로 설명

**Scrap(스크랩/폐기)** = 내가 불량 판단해서 버리는 행위. **항상 창고 가용분에서 차감** (Loss와 달리 선택 아님).

공정 단계(`process_stage`)를 지정해 "어느 공정에서 폐기했는지" 추적 가능.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/scrap` | POST | 폐기 기록 + 재고 차감 |
| `/api/scrap` | GET | 목록 (item_id / batch_id 필터) |

### 요청
```json
POST /api/scrap
{
  "item_id": "...",
  "quantity": 1,
  "process_stage": "AR",
  "reason": "용접 크랙 발견",
  "operator": "김현우"
}
```

### 처리
```
1. 창고 가용 검사 (wh - pending) >= qty?
   부족 → 422
2. ScrapLog 생성 (process_stage 포함)
3. warehouse_qty -= qty
4. TransactionLog(SCRAP, -qty)
5. commit
```

---

## FAQ

**Q. 부서 PRODUCTION에 있는 걸 Scrap하려면?**
직접 이 API로는 불가(창고만 대상). 먼저 `transfer-to-warehouse`로 창고 복귀 후 Scrap. 또는 `mark-defective`로 DEFECTIVE 격리 → `supplier-return` 경로.

**Q. `process_stage` 용도?**
누적 집계해 어느 공정에서 불량이 자주 나는지 분석. 실제 재고 로직엔 영향 없음.

**Q. 배치와 연결된 Scrap?**
Queue 배치 확정 시 SCRAP direction 라인은 자동으로 `ScrapLog` 생성 + `batch_id` 링크.

**Q. Scrap 취소?**
API 없음. 잘못 찍었으면 `receive` 로 되돌려 입고 + 메모에 참조.

---

## 관련 문서

- [[backend/app/routers/loss.py.md]] — Loss(원인 불명) 비교
- [[backend/app/routers/queue.py.md]] — 배치 내 SCRAP 라인
- [[backend/app/routers/variance.py.md]]
- [[backend/app/models.py.md]] — `ScrapLog`
- 용어 사전 — Scrap / Loss / Variance

Up: [[backend/app/routers/routers]]
