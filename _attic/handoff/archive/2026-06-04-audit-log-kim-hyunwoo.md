# 핸드오프 — 김현우 미해결 2건 (audit 로그 묶음)

> **작업 범위**: 재작업 시 회수 외 항목 소실 + 입출고 저장 덮어쓰기.
> 두 건 모두 **"변경 이력이 사라진다"는 같은 뿌리**에서 나온 문제다.
> audit 로그 강화 작업과 한 묶음으로 처리하면 자연스럽다.

---

## 1. 재작업 시 회수 외 항목 소실 → 격리 이동

### 현재 동작
재작업(DISASSEMBLE) 처리 시 BOM 자식 부품 중 **양품으로 회수된 항목만 PRODUCTION 재고로 복귀**하고,
나머지 항목(폐기·불량 등)은 **아무 기록 없이 사라진다**.

### 기대 동작
회수되지 않은 항목은 자동으로 **불량 격리(quarantine)** 로 이동. 사라지면 추적 불가 + 폐기와 격리 구분 안 됨.

### 점검 출발점

| 위치 | 확인 내용 |
|------|-----------|
| `backend/app/services/inv_defective.py` | `submit_defective_disassemble` — 자식 처리 분기. 회수 외 항목에 `mark_defective` 호출이 있는지 |
| `backend/app/routers/defects.py` | `POST /api/defects/disassemble` 처리 흐름 |
| `frontend/app/legacy/_components/_defect_hub/DisassembleTree.tsx` | 자식별 액션(회수/폐기) 전송 페이로드 — "폐기"로 보낸 항목이 격리 처리되는지 |
| `frontend/app/legacy/_components/_defect_hub/DefectActionStep.tsx` | 액션 옵션 목록 |

### 구현 방향 (안)
- 재작업 처리 후 자식 항목 중 회수로 표시되지 않은 항목을 `mark_defective` 로 격리.
- 불량 허브(`DefectHubPanel`)에 해당 항목이 정상 노출되는지 확인.
- 기존 `io-defect.spec.ts` e2e에 분해 시나리오 추가 검토.

### 주의
- 불량 허브(DefectHubPanel·DefectHubKpiCards 등) 및 격리 API는 이미 구현 완료.
  재구현 금지 — 핸드오프 [`2026-06-04-defect-screen-followup.md`](2026-06-04-defect-screen-followup.md) 참고.
- `submit_defective_disassemble` 내 기존 로직을 최대한 유지하고, 회수 외 항목 분기만 추가.

---

## 2. 입출고 저장 덮어쓰기 → 새 행 쌓기

### 현재 동작
입출고 수정 모달에서 저장하면 **같은 트랜잭션 ID에 UPDATE** → 이전 상태 손실.
누가·언제·뭐를 바꿨는지 추적 불가.

### 기대 동작
매 저장마다 **새 트랜잭션 행(또는 audit 행)이 쌓임**. 이전 내역은 그대로 남고, 수정 이력을 소급 확인 가능.

### 점검 출발점

| 위치 | 확인 내용 |
|------|-----------|
| `frontend/app/legacy/_components/_history_sections/TransactionEditUnifiedModal.tsx` | 저장 시 PUT/PATCH 호출 여부 |
| `backend/app/routers/inventory/transactions.py` | 수정 라우터 — in-place UPDATE인지, audit_log 행 별도 생성인지 |
| `backend/app/models/` | audit_log 테이블 구조 — 트랜잭션별 변경 이력 컬럼 존재 여부 |

### 구현 방향 (안)
**A안 — 새 트랜잭션 행 삽입**: 수정 시 기존 행을 `deleted_at` soft-delete하고 새 행 INSERT.
기존 조회 쿼리에서 `deleted_at IS NULL` 필터 필요.

**B안 — audit_log 행 추가**: 트랜잭션 원본은 UPDATE 유지하되, 변경 전·후 스냅샷을 `audit_log` 테이블에 기록.
이미 `AdminAuditLog`·운영 로그 시스템이 있으므로 확장 가능성 있음 (`aa5ea014`, `b88a8190` 커밋 참고).

> 방향 확정은 사용자와 먼저 합의 후 진행.

### 주의
- OpenAPI 스키마 변경 시 baseline 재생성 필수 (`_dev/baselines/openapi.json`).
- 수정 모달 저장 후 내역 화면 리패치가 새 행을 정상 표시하는지 확인.

---

## 3. 공통 — audit 로그와 연계

권동환 요청(사번 기반 audit 로그 보강)이 두 건 모두와 맞닿아 있다.
- 재작업 항목 소실: 소실된 항목이 어디로 갔는지 audit에서 추적 가능해야 함.
- 덮어쓰기: 입출고 모든 변경이 audit 행으로 남아야 함.

관련 구현 (`aa5ea014` 5/29 운영 로그 시스템, `b88a8190` 6/2 사번 감사 보강)을 먼저 읽고 확장 여부 판단.

---

## 4. 검증 체크리스트

- [ ] 재작업 후 회수 외 항목이 불량 허브에 격리 상태로 표시됨
- [ ] 불량 허브 KPI 수치가 격리 항목 추가 후 갱신됨
- [ ] 입출고 수정 저장 후 이전 내역이 조회 가능한 형태로 남음
- [ ] `verify_local.ps1` 전체 그린 (pytest + lint + type + build + OpenAPI drift)
- [ ] e2e — 기존 `io-defect.spec.ts` 그린 유지
