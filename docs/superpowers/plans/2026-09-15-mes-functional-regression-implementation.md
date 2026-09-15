> **추천 모델: GPT-5.6 Sol** - 재고·권한·결재·출하·불량·보고의 상태 전이를 서로 독립된 기대값으로 검증해야 하는 고위험 작업입니다.
> **추천 추론 수준: Extra High** - 기존 테스트가 구현과 함께 잘못된 방향을 정답으로 승인한 사례가 있어 파일별 수정 전에 업무 의미와 저장 결과를 교차 검증해야 합니다.
> **실행 방식: 하위 에이전트 병렬 작업** - 공통 테스트 기반을 먼저 만든 뒤 입출고·출하·불량·표시/보고를 분담하고, 부모 작업이 계약과 최종 병합 관문을 통합 검증합니다.

# DEXCOWIN MES 기능 회귀 테스트 구현 가이드

> **For agentic workers:** REQUIRED SUB-SKILL: `subagent-driven-development` 또는 `executing-plans`를 사용합니다. 체크박스는 실제 검증 증거를 남긴 뒤에만 완료 처리합니다.

**GOAL:** DEXCOWIN MES의 P0 업무계약부터 독립 기대값 기반 회귀 테스트로 고정하고, 재고·권한·결재·표시·집계 결함을 순서대로 수정해 메인 병합 관문을 통과시킨다.

**Goal:** 비전공자도 작업 하나를 골라 기대 결과와 완료 조건을 바로 확인할 수 있고, 개발자는 같은 카드에서 수정 파일·테스트·검증 명령을 찾을 수 있게 한다.

**Architecture:** 상세 실측 기록은 증거 보고서에 보존하고, 이 문서는 구현 순서와 완료 판정만 담당한다. 서비스 기대값, 실제 세션 API/DB, Playwright 사용자 여정, PostgreSQL 경합, 보고 독립 검산을 계층별로 분리하되 같은 계약 ID로 연결한다.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Vitest, Playwright, SQLite 격리 DB, PostgreSQL 경합 테스트.

---

## 1. 이 문서 사용법

한 번에 전부 구현하지 않는다. 아래 순서대로 카드 하나를 고르고, 카드 안의 체크박스를 위에서 아래로 처리한다.

| 순서 | 할 일 | 완료됐다는 뜻 |
|---|---|---|
| 1 | 카드의 `현장 기대`를 읽는다 | 사용자가 원하는 결과와 다르면 코드 작업 전에 문서부터 수정 |
| 2 | 연결된 상세 근거를 읽는다 | 현재 화면·서버·DB가 어떻게 다른지 파악 |
| 3 | RED 테스트를 먼저 작성한다 | 현 결함에서 기대한 이유로 실패 |
| 4 | 최소 범위만 수정한다 | 카드의 기대 결과만 충족하고 다른 업무 의미는 변경하지 않음 |
| 5 | 카드 검증 명령을 실행한다 | 관련 테스트가 모두 통과하고 격리 DB 밖의 데이터는 무변경 |
| 6 | 완료 증거를 카드에 기록한다 | 실행 명령·통과 개수·확인한 재고 전후값을 남김 |

상세 근거: [기능 회귀 업무계약 조사 보고서](../specs/2026-09-14-mes-functional-regression-contract.md)

## 2. 전체 구현 순서

`0 → 1 → (2, 3) → (4, 5, 6, 7) → (8, 9, 10) → 11 → 12`

괄호 안 카드는 공통 테스트 기반이 끝난 뒤 서로 다른 파일을 맡길 때 병렬 진행할 수 있다. 같은 카드 안의 RED 작성·수정·검증은 한 작업자가 순서대로 수행한다.

| 카드 | 구현 묶음 | 먼저 하는 이유 | 선행 카드 | 완료 후 다음에 열리는 작업 |
|---|---|---|---|---|
| 0 | 사용자 기대값 확정 | 잘못된 현행을 테스트 정답으로 굳히지 않기 위해 | 없음 | 전체 |
| 1 | 공통 snapshot·계약 ID 기반 | 모든 도메인이 같은 재고·원장 판정식을 쓰기 위해 | 0 | 2~11 |
| 2 | 원자재 권한 전 진입점 | 현재 남아 있는 서버 우회 경로를 먼저 닫기 위해 | 1 | 5, 12 |
| 3 | 복수 오류 전체 차단·원자성 | 부분 성공 가능성을 모든 작업에서 먼저 제거하기 위해 | 1 | 4~7 |
| 4 | 입출고 방향·기본/커스텀 BOM | 실제 재고의 핵심 의미를 고정하기 위해 | 2, 3 | 5, 8, 9 |
| 5 | 결재·자가승인·반려·취소 | 승인 전후 재고와 예약 상태를 고정하기 위해 | 2, 3, 4 | 8, 9 |
| 6 | 불량·복귀·폐기·반품·재작업 | 원건 잔량과 위치 이동을 고정하기 위해 | 3 | 8, 9 |
| 7 | 출하 요청·예약·픽업·취소 | 잘못된 실제 출하품 차감 위험을 제거하기 위해 | 3 | 8, 9 |
| 8 | 입출고 내역·필터·취소 표시 | 앞 카드의 실제 저장 결과를 사용자에게 정확히 보여주기 위해 | 4~7 | 9, 12 |
| 9 | 일일·주간보고·공식 파일 | 원장부터 보고까지 같은 업무 의미를 쓰게 하기 위해 | 4~8 | 12 |
| 10 | 관리자 기준정보 연쇄 | 기준 변경 후 새 작업과 과거 이력을 함께 보호하기 위해 | 4~8 | 12 |
| 11 | PostgreSQL 동시성 | 직렬 테스트가 놓치는 중복 승인·차감을 막기 위해 | 4~7 | 12 |
| 12 | 최종 병합 관문 | 모든 P0 계약과 격리 조건을 한 번에 판정하기 위해 | 2~11 | 메인 병합 검토 |

## 3. 모든 카드의 공통 완료 조건

| 번호 | 항상 확인할 값 | 통과 조건 |
|---|---|---|
| C1 | 전체 재고 | `Inventory.quantity = warehouse_qty + 모든 InventoryLocation.quantity` |
| C2 | 음수·예약 | 모든 수량은 0 이상이고 `pending_quantity ≤ source quantity` |
| C3 | 영향 범위 | 대상 품목·대상 위치 외 재고, 예약, 요청, 원장은 무변경 |
| C4 | 승인 전 | 물리 재고·완료 원장은 불변이고 필요한 출발 위치 예약만 생성 |
| C5 | 완료 후 | 예약 해제·재고 이동·요청 상태·TransactionLog·operation/effect가 함께 확정 |
| C6 | 실패 | 정상 품목을 포함한 전체 요청이 rollback되고 모든 오류를 표시 |
| C7 | 재시도 | 같은 요청은 효과 1회, 같은 키의 다른 내용은 충돌·무변경 |
| C8 | 취소 | 원본을 삭제하지 않고 연결 역전을 만들며 `S0 → S0+D → S0` |
| C9 | 감사 | 요청자·승인자·실행자·취소자와 KST 시각을 각 역할대로 보존 |
| C10 | 사용자 표시 | 최종 확인·완료창·내역·보고가 같은 품목·위치·유형·수량을 말함 |

---

## 4. 구현 카드

### 카드 0. 기대값 승인표 확정 `[GPT-5.6 Sol] [순차]`

**현장 목표:** 사용출고·품목 전환·필터 집계·불량 사유처럼 코드만 보고 정할 수 없는 정책을 먼저 확정한다.

**Files:**

- Modify: `docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md`
- Read: 같은 문서의 `3.3 먼저 결정할 항목`

- [ ] D1~D10의 권장 기준을 사용자가 승인하거나 수정한다.
- [ ] 수정된 결정이 9장의 같은 업무 행과 모순되지 않는지 대조한다.
- [ ] 승인되지 않은 정책은 P0 테스트의 고정 기대값에서 제외한다.
- [ ] 확정된 행에 계약 ID와 `사용자 승인일`을 기록한다.

**완료 판정:** `정책 결정 필요`인 행이 어떤 구현 카드의 assert에도 암묵적으로 들어가 있지 않다.

### 카드 1. 공통 재고 snapshot과 독립 oracle `[GPT-5.6 Sol] [순차]`

**현장 목표:** 구현 함수가 틀려도 테스트 기대값까지 같이 틀리지 않도록, 작업 전후 숫자를 독립 계산한다.

**Files:**

- Create: `backend/tests/contract/__init__.py`
- Create: `backend/tests/contract/inventory_snapshot.py`
- Create: `backend/tests/contract/test_inventory_snapshot.py`
- Modify: `backend/tests/conftest.py`

**구현 계약:**

```python
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

@dataclass(frozen=True)
class InventorySnapshot:
    item_id: UUID
    total: Decimal
    warehouse: Decimal
    warehouse_pending: Decimal
    locations: dict[tuple[UUID, str], tuple[Decimal, Decimal]]
    request_count: int
    transaction_count: int
    operation_count: int

def assert_location_delta(
    before: InventorySnapshot,
    after: InventorySnapshot,
    *,
    warehouse: Decimal = Decimal("0"),
    locations: dict[tuple[UUID, str], Decimal] | None = None,
) -> None:
    expected_locations = locations or {}
    assert after.warehouse - before.warehouse == warehouse
    for key in before.locations.keys() | after.locations.keys():
        before_qty = before.locations.get(key, (Decimal("0"), Decimal("0")))[0]
        after_qty = after.locations.get(key, (Decimal("0"), Decimal("0")))[0]
        assert after_qty - before_qty == expected_locations.get(key, Decimal("0"))
    assert after.total == after.warehouse + sum(qty for qty, _ in after.locations.values())
```

- [ ] helper 자체 테스트를 RED로 작성해 누락 위치·잘못된 delta·총량 불일치를 각각 실패시킨다.
- [ ] `db_session`으로 품목·창고·두 부서·정상/불량 위치·예약·원장 수를 한 번에 snapshot한다.
- [ ] 기대 위치 외 변화가 있으면 품목·부서·상태와 전후값이 실패 메시지에 나오게 한다.
- [ ] 기존 테스트 하나를 이 helper로 전환해 실제 사용성을 검증한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/contract/test_inventory_snapshot.py tests/services/test_inv_transfer.py -q
```

**완료 판정:** 일부 위치만 assert해서 다른 부서의 잘못된 변화를 놓치는 테스트가 새 카드에 남지 않는다.

### 카드 2. 원자재 입고 권한 전 진입점 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 원자재 입고는 창고 정·부만 할 수 있고, 일반 직원은 미리보기나 초안으로도 우회하지 못한다.

**Files:**

- Modify: `backend/app/routers/io.py:131-166`
- Modify: `backend/app/services/io_draft.py:86-139`
- Modify: `backend/app/services/io_persist.py:475-525`
- Test: `backend/tests/test_io_v2.py:1632-1713`
- Create: `backend/tests/contract/test_receive_entrypoint_permissions.py`

**RED 표:**

| 진입점 | 창고 정/부 | 일반 직원 | 잘못된 조합 |
|---|---:|---:|---:|
| `POST /api/io/preview` | 200 | 403 | 422 |
| `PUT /api/io/draft` | 200 | 403 | 422 |
| `POST /api/io/submit` | 201 | 403 | 422 |
| `POST /api/io/draft/{id}/submit` | 201 | 403 | 422 |

- [ ] 실제 작업자 세션으로 위 12칸을 parameterize한 테스트를 작성한다.
- [ ] 모든 403/422에서 batch·request·재고·예약·log·operation이 0변화인지 snapshot으로 확인한다.
- [ ] preview와 draft-save에도 최종 제출과 같은 receive 전용 권한 검사를 연결한다.
- [ ] 권한 있는 공급처 입고는 창고만 증가하고 대기 승인함을 만들지 않는지 확인한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/contract/test_receive_entrypoint_permissions.py tests/test_io_v2.py -q
```

**상세 근거:** 조사 보고서 `3.5`, `8.17`.

### 카드 3. 복수 오류 전체 표시·다음 단계 차단 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 여러 품목 중 하나라도 오류면 어떤 작업에서도 다음 단계로 넘어가지 않고, 모든 오류를 한 번에 보여준다.

**Files:**

- Modify: `frontend/app/mes/_components/_warehouse_v2/useIoWorkState.ts:104-134`
- Modify: `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:137-206`
- Modify: `frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx`
- Modify: `frontend/app/mes/_components/_defect_hub/DefectBatchConfirm.tsx`
- Test: `frontend/app/mes/_components/_warehouse_v2/__tests__/IoBundleCart.layout.test.tsx`
- Test: `frontend/app/mes/_components/_defect_hub/__tests__/DefectCartFlow.test.tsx`
- Test: `backend/tests/services/test_io_actions.py`
- Create: `frontend/tests/e2e/batch-validation-blocks-next-step.spec.ts`

- [ ] 정상 1개+부족 1개, 부족 2개, 0수량, 음수, EA 소수, 중복 품목을 각각 RED로 작성한다.
- [ ] 오류가 있는 모든 행에 품목 코드와 이유가 보이고 `제출 확인`이 비활성인지 검증한다.
- [ ] 불량 격리에서도 오류가 있으면 확인 modal 자체가 열리지 않는지 검증한다.
- [ ] UI를 우회한 API 요청이 정상 행까지 포함해 전체 rollback되는지 검증한다.
- [ ] 첫 오류에서 예외를 던지는 서버 경로는 검증 오류를 모은 뒤 한 응답으로 반환하도록 최소 수정한다.

**검증:**

```powershell
cd C:\ERP\frontend
npm test -- --run app/mes/_components/_warehouse_v2/__tests__/IoBundleCart.layout.test.tsx app/mes/_components/_defect_hub/__tests__/DefectCartFlow.test.tsx
npx playwright test tests/e2e/batch-validation-blocks-next-step.spec.ts
cd C:\ERP\backend
python -m pytest tests/services/test_io_actions.py -q
```

**상세 근거:** 조사 보고서 `4 IO-BATCH-VALIDATE-001`, `8.10`, `3.4 P0`.

### 카드 4. 입출고 방향과 기본·커스텀 BOM `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 부서 선택 없이 품목 공정 위치를 사용하고, 기본 BOM과 커스텀 BOM의 서로 다른 재고 의미를 숫자로 고정한다.

**Files:**

- Modify only if RED requires: `backend/app/services/io_dispatch.py`
- Modify only if RED requires: `backend/app/services/io_preview.py`
- Test: `backend/tests/services/test_io_dispatch_custom_bom_routes.py`
- Test: `backend/tests/services/test_io_dispatch.py`
- Test: `backend/tests/test_io_v2.py`
- Create: `backend/tests/contract/test_io_direction_oracle.py`
- Create: `frontend/tests/e2e/io-contract-directions.spec.ts`

**독립 기대값:**

| 작업 | 초기값 | 완료 후 |
|---|---|---|
| 창고→조립 3 | 창고 10, 조립 2 | 창고 7, 조립 5 |
| 조립→창고 3 | 조립 10, 창고 2 | 조립 7, 창고 5 |
| 기본 생산 | 상위 0, 하위 10, 소요 2 | 상위 1, 하위 8 |
| 기본 분해 | 상위 7, 하위 5, 회수 2 | 상위 6, 하위 7 |
| 커스텀 생산 | 상위 0, 선택 하위 0/제외 하위 4 | 상위 0, 선택 하위 2/제외 하위 4 |
| 커스텀 분해 | 상위 7, 선택 하위 5/제외 하위 4 | 상위 7, 선택 하위 3/제외 하위 4 |

- [ ] 표 6행을 서비스/API 테스트로 작성하고 endpoint·원장 부호까지 직접 assert한다.
- [ ] 커스텀 생산/분해는 상위와 제외 하위의 모든 위치·예약·원장이 0변화인지 확인한다.
- [ ] 서로 다른 공정 하위를 한 작업에 섞어 각 하위가 자기 공정 위치만 바꾸는지 확인한다.
- [ ] stale preview/token, 자식·수량·origin 위조를 전체 거부한다.
- [ ] Playwright에서 최종 확인의 낱개/BOM/반영 건수와 완료 내역을 DB 결과와 대조한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/contract/test_io_direction_oracle.py tests/services/test_io_dispatch_custom_bom_routes.py tests/test_io_v2.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/io-contract-directions.spec.ts
```

**상세 근거:** 조사 보고서 `3.5`, `8.22`.

### 카드 5. 결재·자가승인·반려·취소 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 권한 보유자는 자동 승인되고, 무권한자는 올바른 승인함에서 결재받기 전까지 실제 재고가 움직이지 않는다.

**Files:**

- Modify only if RED requires: `backend/app/services/sr_approval.py`
- Modify only if RED requires: `backend/app/services/sr_execution.py`
- Test: `backend/tests/services/test_sr_approval.py`
- Create: `backend/tests/contract/test_approval_role_matrix.py`
- Modify: `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:66-116`
- Modify: `frontend/app/mes/_components/_warehouse_v2/IoSubmitModals.tsx`
- Create: `frontend/tests/e2e/io-department-approval-cycle.spec.ts`
- Create: `frontend/tests/e2e/io-self-approval-copy.spec.ts`

- [ ] 창고 정/부/없음 × 부서 정/부/없음 × 작업 유형을 역할표로 parameterize한다.
- [ ] 무권한 요청은 승인 전 물리 재고·완료 내역 0변화와 정확한 source 예약만 확인한다.
- [ ] 자가승인은 대기열 0, 즉시 효과 1회, 최종 버튼·확인창·완료창이 모두 자동 승인 완료를 말하게 한다.
- [ ] 잘못된 PIN·타부서 승인·권한 회수·중복 승인·순서 건너뛰기를 무변경으로 거부한다.
- [ ] 반려·대기 취소는 예약만 해제하고, 완료 후 취소는 연결 역전으로 최초 상태를 복원한다.
- [ ] 목록과 상세에서 요청자·승인자·실행자·취소자를 구분한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/contract/test_approval_role_matrix.py tests/services/test_sr_approval.py tests/services/test_sr_execution.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/io-approval-cycle.spec.ts tests/e2e/io-department-approval-cycle.spec.ts tests/e2e/io-self-approval-copy.spec.ts
```

**상세 근거:** 조사 보고서 `8.23`~`8.25`.

### 카드 6. 불량·복귀·폐기·반품·재작업 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 선택한 출발 위치와 불량 원건만 변하고, 사용자가 보는 수량·업무명이 실제 이동과 일치한다.

**Files:**

- Modify only if RED requires: `backend/app/services/defect_actions.py`
- Modify only if RED requires: `backend/app/services/sr_execution.py`
- Test: `backend/tests/services/test_defect_actions.py`
- Test: `backend/tests/test_defect_flow.py`
- Test: `backend/tests/services/test_sr_execution.py`
- Modify: `frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx`
- Modify: `frontend/app/mes/_components/_defect_hub/DefectProcessPanel.tsx`
- Modify: `frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx`
- Create: `frontend/tests/e2e/defect-full-contract.spec.ts`

- [ ] 창고/부서 격리의 정상 `-q`, 같은 위치 격리 `+q`, 원건 잔량을 한 snapshot으로 검증한다.
- [ ] 부분/전체 정상 복귀가 선택 원건만 줄이고 정상 위치만 늘리는지 검증한다.
- [ ] B급·구형·폐기·반품의 실제 분류 위치와 목록 업무명이 일치하는지 검증한다.
- [ ] 재작업 상위 감소와 하위 정상·격리·폐기 배분합을 검증한다.
- [ ] 부서 출처 선택 화면에 창고가 아니라 실제 자동 부서 가용량이 표시되게 한다.
- [ ] 복수 원건 중 하나의 잔량·예약이 달라지면 전체 처리 0건인지 검증한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/services/test_defect_actions.py tests/test_defect_flow.py tests/services/test_sr_execution.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/io-defect.spec.ts tests/e2e/defect-quarantine-records.spec.ts tests/e2e/defect-full-contract.spec.ts
```

**상세 근거:** 조사 보고서 `8.5`~`8.11`, `8.13`, `8.18`.

### 카드 7. 출하 요청·준비·픽업·취소 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 사용자가 고른 실제 출하품이 준비 예약부터 픽업·취소·내역까지 같은 품목 ID로 유지된다.

**Files:**

- Modify only if RED requires: `backend/app/services/shipping.py`
- Modify only if RED requires: `backend/app/routers/shipping.py`
- Test: `backend/tests/routers/test_shipping.py`
- Test: `backend/tests/services/test_shipping_actions.py`
- Test: `backend/tests/services/test_shipping_workflow_integrity.py`
- Modify only outside frozen card sizing: `frontend/app/mes/_components/DesktopShippingView.tsx`
- Create: `frontend/tests/e2e/shipping-ui-full-cycle.spec.ts`

- [ ] UI 1단계 PF부터 5단계 확인까지 실제 요청을 만들고 저장 snapshot과 필드별 대조한다.
- [ ] 기준 PF·실제 출하품·최종 PF가 다르면 역할 라벨을 명확히 하고 실제 차감 ID는 끝까지 동일하게 한다.
- [ ] 준비 완료는 물리 차감 0, allocation RESERVED, 정확한 source 예약만 생성한다.
- [ ] 픽업 완료는 예약분만 차감하고 실제 클릭한 사용자를 픽업 실행자로 기록한다.
- [ ] 준비 취소·픽업 취소가 해당 요청의 예약/재고만 원복하고 정·역거래를 상세에 연결한다.
- [ ] 응답 유실·동일 command 재시도·다른 출하와 재고 경쟁에서 중복 차감이 없는지 검증한다.
- [ ] 동결된 5단계 카드 높이·열·스크롤 구조는 변경하지 않는다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/routers/test_shipping.py tests/services/test_shipping_actions.py tests/services/test_shipping_workflow_integrity.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/shipping-ui-full-cycle.spec.ts
```

**상세 근거:** 조사 보고서 `8.4`, `8.12`, `3.4 P0`.

### 카드 8. 입출고 내역·필터·취소 표시 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 한 행만 봐도 누가 무엇을 어느 위치에서 얼마나 처리했고 취소됐는지 알 수 있다.

**Files:**

- Modify only if RED requires: `backend/app/routers/inventory/transactions.py`
- Modify only if RED requires: `backend/app/routers/inventory/_tx_filters.py`
- Test: `backend/tests/routers/test_transaction_display_groups.py`
- Test: `backend/tests/routers/test_transactions_monthly_counts.py`
- Test: `backend/tests/routers/test_transactions_summary.py`
- Modify: `frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts`
- Modify: `frontend/app/mes/_components/_history_sections/historyPresentation.ts`
- Modify: `frontend/app/mes/_components/_history_sections/historyDetailSummary.ts`
- Create: `frontend/tests/e2e/history-real-data-contract.spec.ts`

- [ ] 원자재·창고이동·부서작업·사용출고·보정·불량·반품·재작업·출하의 정/역거래 fixture를 만든다.
- [ ] 목록·상세·월 집계가 같은 업무 taxonomy를 사용하고 부서 입출고를 수량보정으로 세지 않는지 검증한다.
- [ ] 실제 출발/도착 위치와 전후 수량을 operation effect에서 독립 계산해 화면과 대조한다.
- [ ] 요청자·승인자·실행자·취소자를 모두 별도 표시한다.
- [ ] 같은 그룹 필터는 OR, 다른 그룹은 AND이며 행·총수·카드·reference summary·내보내기가 같은 모집단인지 확인한다.
- [ ] 원본/취소 연결, 전체/일부 취소, 이중 취소 차단을 실제 데이터 E2E로 확인한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/routers/test_transaction_display_groups.py tests/routers/test_transactions_monthly_counts.py tests/routers/test_transactions_summary.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/io-history-labels.spec.ts tests/e2e/history-real-data-contract.spec.ts
```

**상세 근거:** 조사 보고서 `8.3`, `8.12`~`8.25`의 내역 행.

### 카드 9. 일일·주간보고와 공식 파일 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 같은 원장 거래가 일일·주간·공식 파일에서 서로 다른 업무나 수량으로 보이지 않는다.

**Files:**

- Modify: `frontend/app/mes/_components/_daily_report/DailyWorkActivity.tsx:143-146`
- Test: `frontend/app/mes/_components/_daily_report/__tests__/DailyWorkActivity.test.tsx`
- Modify only outside frozen backend unless explicitly approved: `backend/app/routers/daily_work_reports.py`
- Test: `backend/tests/routers/test_daily_work_reports.py`
- Test only, frozen production code: `backend/tests/routers/test_weekly_report.py`
- Test only, frozen production code: `backend/tests/services/test_weekly_report_contract.py`
- Test: `backend/tests/services/test_f705_02_production_log.py`
- Create: `frontend/tests/e2e/report-ledger-contract.spec.ts`

- [ ] 일보 거래 펼침 클릭에서 React render 경고·오버레이가 0건인 실패 테스트를 작성한다.
- [ ] 정거래·취소 거래의 업무명·실제 방향·원거래 연결을 일보와 입출고 내역에서 동일하게 표시한다.
- [ ] 고정 주차에 각 업무 정/역거래를 넣고 `현재-이전=활동합계`를 독립 계산한다.
- [ ] 공정 생산 합계·모델별 생산 matrix·F705 셀 합계가 같은 정의를 쓰는지 대조한다.
- [ ] 불일치가 있으면 `verified` 정상 상태로 반환하지 않는 RED를 먼저 만든다.
- [ ] 주간보고 동결 파일은 사용자가 별도로 승인하기 전 수정하지 않고 테스트 증거와 결함만 보고한다.

**검증:**

```powershell
cd C:\ERP\frontend
npm test -- --run app/mes/_components/_daily_report/__tests__/DailyWorkActivity.test.tsx
npx playwright test tests/e2e/report-ledger-contract.spec.ts
cd C:\ERP\backend
python -m pytest tests/routers/test_daily_work_reports.py tests/routers/test_weekly_report.py tests/services/test_weekly_report_contract.py tests/services/test_f705_02_production_log.py -q
```

**상세 근거:** 조사 보고서 `8.20`, `8.21`.

### 카드 10. 관리자 기준정보 연쇄 `[GPT-5.6 Sol] [병렬 가능]`

**현장 목표:** 관리자 변경은 이후 새 업무에 정확히 반영되고 과거 거래·현재 재고·대기 업무를 손상시키지 않는다.

**Files:**

- Test: `backend/tests/routers/test_settings_integrity.py`
- Test: `backend/tests/routers/test_admin_inventory_integrity.py`
- Test: `backend/tests/dependencies/test_admin.py`
- Test: `frontend/app/mes/_components/_admin_hooks/__tests__/useAdminEmployeesCommands.test.tsx`
- Test: `frontend/app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomWorkbench.test.tsx`
- Create: `frontend/tests/e2e/admin-master-data-cascade.spec.ts`

- [ ] 직원 역할 부여/회수 뒤 재로그인하여 메뉴·승인함·API 권한이 함께 바뀌는지 검증한다.
- [ ] 부서 이름 변경 뒤 같은 부서 ID의 재고가 다른 위치로 이동하지 않는지 확인한다.
- [ ] BOM 추가·수량 변경·삭제 뒤 신규 preview만 바뀌고 기존 요청 snapshot은 유지되는지 확인한다.
- [ ] 재고·예약·BOM·대기 요청·거래 이력이 있는 품목/부서/직원 삭제가 의존성 목록과 함께 차단되는지 확인한다.
- [ ] 무결성 dry-run은 0변화, 수리 실패는 inventory·audit 전체 rollback, 재실행은 추가 변화 0인지 확인한다.
- [ ] 관리자 화면 E2E fixture는 UUID 접미사로 만들고 해당 fixture만 정리한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/routers/test_settings_integrity.py tests/routers/test_admin_inventory_integrity.py tests/dependencies/test_admin.py -q
cd C:\ERP\frontend
npx playwright test tests/e2e/admin-navigation.spec.ts tests/e2e/admin-master-data-cascade.spec.ts
```

**상세 근거:** 조사 보고서 `8.19`.

### 카드 11. 동시성·재시도 `[GPT-5.6 Sol] [순차]`

**현장 목표:** 두 사용자가 동시에 승인·취소·예약·픽업해도 성공 효과가 한 번뿐이고 재고가 중간값에 남지 않는다.

**Files:**

- Test: `backend/tests/concurrency/test_approve_concurrent.py`
- Test: `backend/tests/concurrency/test_cancel_approve_conflict.py`
- Test: `backend/tests/concurrency/test_defective_concurrent.py`
- Test: `backend/tests/concurrency/test_shipping_cancel_retry_concurrent.py`
- Test: `backend/tests/concurrency/test_transfer_concurrent_atomic.py`
- Create: `backend/tests/concurrency/test_contract_terminal_states.py`

- [ ] 승인×승인, 승인×반려, 승인×취소, 픽업×취소, 격리 복귀×폐기를 두 독립 session으로 실행한다.
- [ ] 성공 횟수는 허용된 한 번이고 최종 재고는 `S0` 또는 `S0+D` 중 정확히 하나인지 확인한다.
- [ ] 요청·라인·allocation·record·reversal 상태가 서로 다른 terminal 상태로 갈라지지 않는지 확인한다.
- [ ] unique/lock 오류가 사용자에게 재시도 가능한 응답으로 정리되고 추가 효과는 없는지 확인한다.

**검증:**

```powershell
cd C:\ERP\backend
python -m pytest tests/concurrency/test_contract_terminal_states.py tests/concurrency/test_approve_concurrent.py tests/concurrency/test_cancel_approve_conflict.py tests/concurrency/test_defective_concurrent.py tests/concurrency/test_shipping_cancel_retry_concurrent.py tests/concurrency/test_transfer_concurrent_atomic.py -q
```

### 카드 12. 최종 병합 관문 `[GPT-5.6 Sol] [순차]`

**현장 목표:** 큰 리팩터링을 “기존과 같다”가 아니라 “사용자 기대와 같다”로 판정한다.

**Files:**

- Modify: `scripts/dev/verify_local.ps1`
- Create: `docs/superpowers/specs/mes-functional-contract-index.md`
- Update: `docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md`
- Update: `docs/superpowers/plans/2026-09-15-mes-functional-regression-implementation.md`

- [ ] P0 계약 ID마다 서비스/API/Playwright 테스트 경로와 마지막 통과 증거를 인덱스에 기록한다.
- [ ] 인덱스의 P0에 테스트 경로가 없거나 파일이 사라지면 검증이 실패하게 한다.
- [ ] 실제 `mes.db` family의 실행 전후 SHA가 같은지 E2E teardown 결과로 확인한다.
- [ ] weekly report·모바일 탭·출하 5단계 카드 동결 파일의 무승인 변경이 없는지 확인한다.
- [ ] 사용자 승인된 기대값과 최종 테스트 assert를 행별로 대조한다.
- [ ] 사용자가 commit/push를 요청한 경우에만 staged 변경으로 최종 로컬 게이트를 실행한다.

**최종 검증:**

```powershell
cd C:\ERP
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet auto
git diff --check
```

**완료 판정:** P0 실패 0건, 계약 누락 0건, 실제 DB 변경 0건, 미승인 동결 파일 변경 0건이다.

---

## 5. 작업 완료 기록 형식

각 카드 끝에 아래 한 행을 추가한다. “테스트 통과”만 적지 말고 재고 전후값 또는 권한 무변경 증거를 함께 적는다.

| 완료일 | 카드 | 실행 명령 | 결과 | 핵심 증거 | 남은 위험 |
|---|---|---|---|---|---|
| `YYYY-MM-DD` | 카드 번호와 이름 | 실제 실행한 명령 | 통과/실패 개수 | 예: 창고 10→7, 조립 2→5, 취소 후 10/2 | 후속 카드 또는 없음 |

## 6. 현재 시작점

| 항목 | 현재 상태 |
|---|---|
| 업무 경우 조사 | 완료: 상세 보고서 8장과 전체 경우 목록 9장 |
| 개발 서버 원복 | 검증 거래의 물리 재고 원복 완료, 정·역거래 감사 기록은 보존 |
| 기존 backend 표본 | 관련 110개 테스트 통과 |
| 기존 frontend 표본 | 관련 39개 테스트 통과 |
| 사용자 기대 확정 | 카드 0의 D1~D10 확인 필요 |
| 첫 구현 대상 | 카드 2 원자재 권한, 카드 3 복수 오류 차단, 카드 7 출하 실제 품목 일치 |

기존 테스트 통과 수는 완료 판정이 아니다. 실제 브라우저에서 결재 문구·내역 분류·일보 오류·출하 품목 불일치 후보가 재현됐으므로, 카드별 독립 기대값과 저장 결과가 모두 맞아야 완료다.
