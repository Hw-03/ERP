---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/loss.py
status: active
tags:
  - erp
  - backend
  - router
  - loss
aliases:
  - 손실 라우터
---

# loss.py

> [!summary] 역할
> 재고 손실(분실, 파손 등 사유 불명 감소) 기록 API. 스크랩과 달리 공정 외부에서 발생한 손실을 기록한다.

> [!info] 주요 책임
> - `POST /api/loss/` — 손실 기록 등록 (`deduct=true` 시 재고에서 실제 차감)
> - `GET /api/loss/` — 손실 목록 조회

> [!warning] 주의
> - `deduct` 파라미터로 실재고 차감 여부를 선택 가능

---

## 쉬운 말로 설명

**Loss(분실)** = "어디 갔는지 모름". 반품할 때 부품이 빠져 있거나, 원래 있어야 할 게 없을 때 기록.

원칙적으로 **재고 차감은 하지 않고 기록만**. 내가 들고 있다가 잃어버린 경우엔 `?deduct=true` 쿼리로 창고 가용분에서 차감.

Scrap(내가 일부러 폐기) 과는 다름.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/loss` | POST | Loss 기록 (+ `?deduct=true`이면 재고 차감) |
| `/api/loss` | GET | 목록 (item_id / batch_id 필터) |

### 요청 예시
```json
POST /api/loss?deduct=false
{
  "item_id": "...",
  "quantity": 1,
  "reason": "반품 수령 시 부품 누락",
  "operator": "김현우"
}
```

### 처리
```
1. `LossLog` 행 생성
2. `TransactionLog(LOSS, change=0 or -qty)` 기록
3. deduct=true:
   - 창고 가용(wh - pending) 부족 시 422
   - warehouse_qty -= qty
4. commit
```

---

## FAQ

**Q. `deduct` 없이 Loss만 찍으면 재고 이상 없나?**
수량 변동 없음. 기록만 남는다. 즉 시스템 재고와 실제 재고가 정합 상태라면 그대로 유지.

**Q. Scrap과 언제 구분?**
- Scrap = "내가 불량 판단해서 버림" (현장 폐기). 항상 재고 차감.
- Loss = "어디 갔는지 모름" (관리 누락·반품 누락). 선택적 차감.

**Q. 배치와 연결된 Loss?**
Queue 배치 확정 시 LOSS direction 라인은 자동으로 `LossLog` 생성 + `batch_id` 링크됨.

**Q. 신고 후 나중에 발견하면?**
별도 보정 API 없음. `receive`로 다시 입고하고 메모에 참조 기록.

---

## 관련 문서

- [[backend/app/routers/scrap.py.md]] — Scrap(의도 폐기) 비교
- [[backend/app/routers/variance.py.md]]
- [[backend/app/routers/queue.py.md]] — 배치 내 LOSS 라인
- [[backend/app/models.py.md]] — `LossLog`
- 분해 반품 시나리오

Up: [[backend/app/routers/routers]]
