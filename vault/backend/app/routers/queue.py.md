---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/queue.py
status: active
tags:
  - erp
  - backend
  - router
  - queue
aliases:
  - 대기열 라우터
  - 생산 큐 API
---

# queue.py

> [!summary] 역할
> 생산 대기열(Queue) 배치를 관리하는 API.
> 생산/해체/반품 배치를 생성하고, 자재 투입 내역(Line)을 관리하며, 확정/취소를 처리한다.

> [!info] 주요 책임
> - `POST /api/queue` — 새 배치 생성 (BOM 자동 로드 옵션 포함)
> - `GET /api/queue/` — 배치 목록 조회 (상태·담당자 필터)
> - `GET /api/queue/{batch_id}` — 단일 배치 상세 조회
> - `PUT /api/queue/{batch_id}/lines/{line_id}` — 라인 수량 수정
> - `POST /api/queue/{batch_id}/lines/{line_id}/toggle` — 라인 포함/제외 토글
> - `POST /api/queue/{batch_id}/lines` — 라인 추가
> - `DELETE /api/queue/{batch_id}/lines/{line_id}` — 라인 삭제
> - `POST /api/queue/{batch_id}/confirm` — 배치 확정 (실재고 반영)
> - `POST /api/queue/{batch_id}/cancel` — 배치 취소

> [!warning] 주의
> - 배치 확정(`confirm`) 시 실제 재고 변동이 발생함
> - 배치 상태: `OPEN` → `CONFIRMED` / `CANCELLED`

---

## 쉬운 말로 설명

이 라우터는 **"예약 → 확정 2단계 작업 창구"**다. 당장 재고를 건드리지 않고 예약(pending)만 먼저 걸어두고, 현장에서 실제로 조립/분해/반품이 끝나면 확정(confirm)해서 한 번에 재고를 맞춘다.

### 배치 3종류
- **PRODUCE** (만들기): 완제품 +, 자재 −. BOM 자동 로드.
- **DISASSEMBLE** (분해): 완제품 −, 자재 +. BOM 역방향.
- **RETURN** (반품): 완제품 +(돌아온 것), 자재 +(살릴 것), LOSS(누락).

### 상태 흐름
```
OPEN ─── 확정 ───▶ CONFIRMED (재고 반영, 이력 기록, Variance 기록)
  │
  └── 취소 ────▶ CANCELLED (pending만 롤백)
```

---

## 엔드포인트 상세

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/queue` | POST | 배치 생성 (BOM 자동 로드 옵션) |
| `/api/queue` | GET | 목록 (status, owner 필터) |
| `/api/queue/{batch_id}` | GET | 배치 + 라인 상세 |
| `/api/queue/{batch_id}/lines/{line_id}` | PUT | 라인 수량 변경 (Override) |
| `/api/queue/{batch_id}/lines/{line_id}/toggle` | POST | 포함/제외 + direction 재분류 |
| `/api/queue/{batch_id}/lines` | POST | 수동 라인 추가 (SCRAP/LOSS 등) |
| `/api/queue/{batch_id}/lines/{line_id}` | DELETE | 라인 제거 |
| `/api/queue/{batch_id}/confirm` | POST | 확정 (재고 변동 실행) |
| `/api/queue/{batch_id}/cancel` | POST | 취소 (pending 해제) |

---

## 요청 예시

### 배치 생성 (PRODUCE)
```json
POST /api/queue
{
  "batch_type": "PRODUCE",
  "parent_item_id": "uuid-of-ADX6000",
  "parent_quantity": 2,
  "owner_employee_id": "uuid-of-김현우",
  "load_bom": true,
  "reference_no": "WO-20260422-01",
  "notes": "일일 생산 배치"
}
```
→ 새 배치 생성 + `load_bom=true`면 BOM 직자식 자동 로드 (OUT 방향, `bom_expected` 값 동기화).
→ 각 자재 `inventory.pending_quantity += BOM수량 × parent_quantity`.

### 라인 수량 Override
```json
PUT /api/queue/{batch_id}/lines/{line_id}
{ "quantity": 7 }
```
→ BOM 기대치와 다르게 실제 사용량 지정. pending 재계산.

### 라인 토글 (SCRAP으로 재분류)
```json
POST /api/queue/{batch_id}/lines/{line_id}/toggle
{ "included": true, "new_direction": "SCRAP" }
```
→ OUT → SCRAP (폐기로 기록). 확정 시 `scrap_logs`에 기록.

### 수동 라인 추가 (LOSS)
```json
POST /api/queue/{batch_id}/lines
{
  "item_id": "uuid-부품X",
  "direction": "LOSS",
  "quantity": 1,
  "reason": "반품 시 누락",
  "process_stage": "AR"
}
```

### 확정
```json
POST /api/queue/{batch_id}/confirm
```
→ 내부에서 `queue_svc.confirm_batch()` 원자 실행:
1. OUT: 창고·부서에서 실제 차감, TransactionLog `BACKFLUSH`
2. IN: 창고 또는 지정 부서 증가, TransactionLog `PRODUCE`/`DISASSEMBLE`/`RETURN`
3. SCRAP: `scrap_logs` + 재고 차감 + `SCRAP` 로그
4. LOSS: `loss_logs` + `LOSS` 로그 (재고는 원칙적으로 변동 없음 — 단순 기록)
5. Variance: BOM 기대치와 실제 차이 `variance_logs`
6. `batch.status = CONFIRMED`, `confirmed_at = now()`
7. 모든 pending 해제

### 취소
→ pending만 원복, 재고·이력 변동 없음. `status=CANCELLED`.

---

## FAQ

**Q. OPEN 배치가 쌓이면?**
pending이 누적되어 가용재고 감소. 장기 미확정 배치는 `cancel`로 정리 필요. 화면 `/queue`에서 담당자별 OPEN 배치 확인 가능.

**Q. 확정 후 실수를 발견하면?**
되돌리기 API는 없다. 반대 배치(예: PRODUCE → DISASSEMBLE)로 상쇄. 이력은 양쪽 다 남는다.

**Q. `load_bom=false`면?**
빈 배치. 수동으로 라인 추가해야 한다. 특수한 작업(BOM에 없는 자재 투입)에 사용.

**Q. SCRAP과 LOSS 차이?**
SCRAP = 내가 폐기(현장 불량 발견). LOSS = 어디 갔는지 모름(반품 시 누락분). 둘 다 별도 로그 테이블에 기록.

**Q. Variance는 왜 남기나?**
BOM 설계 수량과 현장 실사용 수량이 다를 때 차이를 추적하기 위함. 반복되면 BOM 수량 자체를 고치는 근거.

**Q. 확정이 도중에 실패하면?**
트랜잭션(`db.commit`)으로 묶여 있어 전체 롤백. 라우터가 422로 사유 반환.

---

## 관련 문서

- [[backend/app/services/queue.py.md]] — `create_batch`, `confirm_batch`, `override_line_quantity` 등 실제 로직
- [[backend/app/services/bom.py.md]] — 배치 생성 시 BOM 로드
- [[backend/app/routers/production.py.md]] — Backflush 단독 경로 (레거시)
- [[backend/app/models.py.md]] — `QueueBatch`, `QueueLine`, `VarianceLog`, `ScrapLog`, `LossLog`
- [[frontend/app/queue/queue]]
- 생산 배치 시나리오 ⭐ PRODUCE 전체 흐름
- 분해 반품 시나리오 — DISASSEMBLE / RETURN
- FAQ 전체

Up: [[backend/app/routers/routers]]
