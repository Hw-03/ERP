---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/variance.py
status: active
tags:
  - erp
  - backend
  - router
  - variance
aliases:
  - 차이 라우터
  - BOM 차이 API
---

# variance.py

> [!summary] 역할
> BOM 예정 수량과 실제 사용 수량의 차이(Variance)를 기록·조회하는 API.

> [!info] 주요 책임
> - `GET /api/variance/` — Variance 목록 조회 (품목·배치 필터)
> - Variance 레코드는 Queue 배치 확정 시 자동 생성됨

---

## 쉬운 말로 설명

**Variance(차이)** = BOM 예상치 − 현장 실사용. 읽기 전용 조회 API. 직접 생성 경로는 없고 `queue.py`의 배치 확정 시 자동 기록.

용도: "BOM에선 2개 쓰라고 했는데 실제로 3개 썼다" 같은 편차 누적 분석 → BOM 개정 근거.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/variance` | GET | 목록 (item_id / batch_id 필터, 최신순) |

응답 (`VarianceLogResponse`):
```json
{
  "var_id": "...",
  "batch_id": "...",
  "item_id": "...",
  "erp_code": "3-AR-0012",
  "item_name": "튜브",
  "bom_expected": 2,
  "actual_used": 3,
  "diff": 1,
  "note": null,
  "created_at": "2026-04-22T10:00:00"
}
```

`diff = actual_used - bom_expected`. 양수 = 더 많이 사용, 음수 = 적게 사용.

---

## FAQ

**Q. 언제 자동 생성?**
`queue confirm_batch()` 내부에서 OUT 라인 중 `bom_expected`가 있고 실제 `quantity`와 다른 경우.

**Q. `bom_expected`가 NULL이면?**
수동 추가한 라인(BOM 기반 아님). Variance 기록 안 됨.

**Q. Variance가 쌓이는 품목은?**
BOM 수량을 실제에 맞게 조정 고려. `bom.py`의 PATCH로 수정 가능.

**Q. 대시보드 이걸로 만들 수 있나?**
가능. 품목별 누적 diff 집계 → BOM 정확도 지표. 현재 API는 row만 반환, 집계는 클라이언트에서.

---

## 관련 문서

- [[backend/app/routers/queue.py.md]] — Variance 생성 경로
- [[backend/app/routers/bom.py.md]] — BOM 수량 수정
- [[backend/app/routers/scrap.py.md]] — 별도 폐기 기록
- [[backend/app/routers/loss.py.md]]
- [[backend/app/models.py.md]] — `VarianceLog`

Up: [[backend/app/routers/routers]]
