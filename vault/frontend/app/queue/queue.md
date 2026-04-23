---
type: index
project: ERP
layer: frontend
source_path: frontend/app/queue/
status: active
tags:
  - erp
  - frontend
  - route
  - queue
aliases:
  - 생산 대기열 페이지
---

# frontend/app/queue

> [!summary] 역할
> `/queue` 경로 라우트. 생산 대기열 배치 관리 화면.

## 관련 문서

- [[backend/app/routers/queue.py.md]]

---

## 쉬운 말로 설명

`/queue` URL. **생산 대기열** 관리 페이지. 배치(batch)를 만들고 수량 조정 후 확정한다.

### 배치 3종류
- **PRODUCE** — 만들기 (BOM 따라 자재 차감 + 완제품 증가)
- **DISASSEMBLE** — 분해 (완제품 차감 + 자재 증가)
- **RETURN** — 반품 (완제품 증가 + 자재 증가 + 누락분 LOSS)

### 상태 흐름
`OPEN` → `CONFIRMED` (확정, 재고 반영)
`OPEN` → `CANCELLED` (취소, pending만 해제)

---

## FAQ

**Q. OPEN 배치 계속 쌓이면?**
pending 예약이 누적되어 가용 재고 감소. 장기 미확정 배치는 정리(cancel) 필요.

**Q. 확정 후 취소 가능?**
API 직접 미제공. 반대 배치(예: PRODUCE → DISASSEMBLE)로 되돌린다.

---

## 관련 문서

- [[backend/app/services/queue.py.md]] — 배치 로직
- 생산 배치 시나리오 ⭐
- 분해 반품 시나리오

Up: [[frontend/app/app]]
