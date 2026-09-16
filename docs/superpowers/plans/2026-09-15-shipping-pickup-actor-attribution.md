> **추천 모델: GPT-5.6 Terra** - 기존 인증 경계 복원, 원장 귀속 정합성, 직원 DB 안전 보정을 함께 다루는 중간 규모 결함 수정입니다.
> **추천 추론 수준: High** - 준비자와 픽업자를 분리하면서 취소·동시성·운영 데이터 보정 회귀를 놓치지 않아야 합니다.
> **실행 방식: 단독 작업** - 핵심 변경이 라우터→트랜잭션 래퍼→서비스 순으로 밀접하게 연결되고 최종 DB 보정도 코드 배포 뒤에 수행해야 합니다.

# 출하 픽업 실제 처리자 귀속 구현 계획

> **For agentic workers:** 실행 시 `test-driven-development`, `efficient-verification`, `verification-before-completion`, 직원 반영 시 `deploy-to-employee`를 순서대로 사용한다. 체크박스를 갱신하며 작업한다.

**GOAL:** 출하 픽업 완료의 실제 로그인 작업자를 거래 원장과 업무 작업 원장에 정확히 기록하고, 감사 증거가 명확한 기존 오기록을 재고 영향 없이 복구한다.

**Goal:** 준비 완료자와 픽업 완료자가 달라도 입출고 이력 담당자와 원장 작업자가 실제 픽업 처리자로 남고 같은 회귀가 테스트에서 차단되게 한다.

**Architecture:** 기존 `X-MES-Employee-Code` → `_load_shipping_actor` 경계를 픽업 완료 라우터에도 적용하고 필수 `Employee actor`를 서비스까지 전달한다. 스키마와 화면은 유지하며, 기존 오기록은 감사 로그와 요청 ID가 단일하게 일치하는 행만 별도 dry-run 복구 도구로 보정한다.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, pytest, Next.js API client, Vitest, PowerShell 배포 도구.

**설계 기준:** [2026-09-15-shipping-pickup-actor-attribution-design.md](../specs/2026-09-15-shipping-pickup-actor-attribution-design.md)

---

## 변경 파일 지도

- `backend/app/routers/shipping.py` — 픽업 완료 요청에서 실제 작업자를 검증하고 전달한다.
- `backend/app/services/shipping_actions.py` — 트랜잭션 경계에서 필수 작업자를 서비스에 전달한다.
- `backend/app/services/shipping.py` — 픽업 작업 원장과 거래 로그를 실제 작업자로 기록한다.
- `backend/tests/routers/test_shipping.py` — 준비자와 픽업자가 다른 HTTP 회귀 및 작업자 거부 계약을 검증한다.
- `backend/tests/services/test_shipping.py` — 서비스가 실제 픽업 작업자를 원장에 쓰는 계약을 검증한다.
- `backend/tests/services/test_shipping_actions.py` — 트랜잭션 래퍼 호출을 필수 작업자 계약에 맞춘다.
- `backend/tests/concurrency/test_shipping_cancel_retry_concurrent.py` — 동시 픽업·취소 시 같은 작업자 계약을 유지한다.
- `backend/tests/ops/test_inventory_cutover.py` — 종결 상태 명령 테스트의 호출 계약을 갱신한다.
- `frontend/lib/__tests__/api-core.test.ts` — 쓰기 요청의 로그인 작업자 헤더 전달을 고정한다.
- `_attic/backend-scripts/repair_shipping_pickup_actor_attribution.py` — 직원 DB 귀속만 dry-run/적용하는 일회성 운영 도구다.
- `backend/tests/ops/test_repair_shipping_pickup_actor_attribution.py` — 복구 도구의 선택·거부·원자성 계약을 검증한다.

프런트 화면, API 메서드, DB 스키마, 주간보고 동결 파일은 수정하지 않는다.

---

### Task 1: 픽업 작업자 회귀 테스트를 먼저 고정한다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `backend/tests/routers/test_shipping.py:1351`
- Modify: `frontend/lib/__tests__/api-core.test.ts:270`

- [ ] **Step 1: 준비자와 픽업자가 다른 HTTP 실패 테스트 작성**

기존 `test_shipping_prepare_actor_is_snapshotted_cleared_and_used_for_pickup_logs`를 “준비자는 유지되고 픽업 원장은 실제 픽업자” 계약으로 바꾼다. 준비 완료 뒤 두 번째 직원을 만들고 헤더를 바꿔 픽업한다.

```python
pickup_actor = _employee(
    db_session,
    code="shipping-pickup-actor",
    name="픽업 실제 작업자",
    department=DepartmentEnum.SHIPPING,
)
db_session.commit()
client.headers["X-MES-Employee-Code"] = pickup_actor.employee_code

picked_up = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
assert picked_up.status_code == 200, picked_up.text
assert picked_up.json()["prepared_by_employee_id"] == str(actor.employee_id)

pickup_logs = db_session.query(TransactionLog).filter_by(
    shipping_request_id=uuid.UUID(request_id),
    shipping_phase="PICKUP",
).all()
assert {log.produced_by for log in pickup_logs} == {pickup_actor.name}
assert {log.producer_employee_id for log in pickup_logs} == {pickup_actor.employee_id}

pickup_operation = db_session.query(InventoryOperation).filter_by(
    domain="shipping",
    action="pickup",
).one()
assert pickup_operation.actor_name == pickup_actor.name
assert pickup_operation.actor_employee_id == pickup_actor.employee_id
```

- [ ] **Step 2: 픽업 작업자 누락·비활성 테스트 작성**

`test_shipping_pickup_complete_rejects_invalid_actor_without_state_changes`를 추가한다. 헤더 누락은 400, 비활성 직원은 403이어야 하며 두 경우 모두 요청 상태가 `PREPARED`, `picked_up_at is None`, 활성 PICKUP 로그 수가 0이어야 한다.

```python
before_status = db_session.get(ShippingRequest, uuid.UUID(request_id)).status
response = client.post(f"/api/shipping/requests/{request_id}/pickup-complete")
db_session.expire_all()
request = db_session.get(ShippingRequest, uuid.UUID(request_id))
assert response.status_code == expected_status
assert before_status == request.status == ShippingRequestStatusEnum.PREPARED
assert request.picked_up_at is None
assert db_session.query(TransactionLog).filter_by(
    shipping_request_id=request.request_id,
    shipping_phase="PICKUP",
).count() == 0
```

- [ ] **Step 3: 프런트 쓰기 헤더 실패 테스트 작성**

`postJson`도 현재 로그인 사번을 전송하는지 고정한다.

```typescript
it("postJson attaches the current employee code", async () => {
  window.sessionStorage.setItem(
    "dexcowin_mes_operator",
    JSON.stringify({ employee_id: "emp-1", name: "Kim", employee_code: "E22" }),
  );
  const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true, body: {} })));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  await postJson("/api/shipping/requests/req-1/pickup-complete", {});

  const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
  expect(headers["X-MES-Employee-Code"]).toBe("E22");
});
```

- [ ] **Step 4: RED 확인**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_shipping.py -k "pickup and actor" -q
Set-Location C:\ERP\frontend
npm test -- lib/__tests__/api-core.test.ts
```

예상: 프런트 헤더 테스트는 통과하고, 백엔드는 픽업 원장에 준비자가 남거나 누락 헤더가 허용되어 실패한다.

---

### Task 2: 실제 픽업 작업자를 필수 서비스 인자로 전달한다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `backend/app/routers/shipping.py:590`
- Modify: `backend/app/services/shipping_actions.py:146`
- Modify: `backend/app/services/shipping.py:1895-1944`

- [ ] **Step 1: 라우터에서 기존 작업자 검증 경계 재사용**

```python
@router.post("/requests/{request_id}/pickup-complete", response_model=ShippingRequestResponse)
def pickup_complete(
    request_id: uuid.UUID,
    http_request: Request,
    db: Session = Depends(get_db),
):
    actor = _load_shipping_actor(http_request, db)
    req = _action_or_422(
        db,
        shipping_actions_svc.pickup_complete,
        request_id,
        actor=actor,
    )
    return _to_response(db, req)
```

- [ ] **Step 2: 트랜잭션 래퍼에서 actor를 필수화**

```python
def pickup_complete(
    db: Session,
    request_id: uuid.UUID,
    *,
    actor: Employee,
) -> ShippingRequest:
    """픽업의 재고·원장·배정·상태를 실제 작업자와 함께 원자적으로 확정한다."""
    with transactional(db):
        return shipping_svc.pickup_complete(db, request_id, actor=actor)
```

- [ ] **Step 3: 서비스와 픽업 로그에 실제 actor 사용**

```python
def _ship_from_item_location(
    db: Session,
    req: ShippingRequest,
    item: Item,
    qty: int,
    notes: str,
    *,
    actor: Employee,
    operation: InventoryOperation | None = None,
) -> None:
    # 기존 재고 계산은 유지
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.SHIP,
        quantity_change=-qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PICKUP_PHASE,
        department=dept,
        operation=operation,
        operation_role=InventoryOperationRoleEnum.PRIMARY,
    )

def pickup_complete(
    db: Session,
    request_id: uuid.UUID,
    *,
    actor: Employee,
) -> ShippingRequest:
    actor = _require_actor(actor)
    req = _lock_request(db, request_id)
    # 기존 상태·재고 검증은 유지
    operation = operation_svc.create_business_operation(
        db,
        domain="shipping",
        action="pickup",
        display_label="출하 픽업",
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        reason=req.notes,
        idempotency_key=workflow_ops.next_operation_key(db, req.request_id, "pickup"),
    )
    _consume_pickup_allocations(
        db,
        req,
        req.final_pf_item,
        request_qty,
        actor=actor,
        operation=operation,
    )
    # 기존 상태 전이·효과·이벤트 기록은 유지
    return req
```

`_consume_pickup_allocations`에서 `_ship_from_item_location`을 호출하는 모든 경로에도 같은 `actor`를 전달한다. `req.prepared_by_*` fallback은 픽업 경로에서 완전히 제거한다.

- [ ] **Step 4: 핵심 회귀 테스트 GREEN 확인**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_shipping.py -k "pickup and actor" -q
```

예상: 실제 픽업자·누락·비활성 계약이 모두 PASS한다.

---

### Task 3: 모든 내부 호출자와 취소·동시성 계약을 명시적 actor로 갱신한다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `backend/tests/services/test_shipping.py:812,1398`
- Modify: `backend/tests/services/test_shipping_actions.py:445-957`
- Modify: `backend/tests/concurrency/test_shipping_cancel_retry_concurrent.py:47,60`
- Modify: `backend/tests/ops/test_inventory_cutover.py:190`

- [ ] **Step 1: 직접 서비스 호출에 실제 직원 전달**

각 테스트의 기존 직원 fixture/조회 결과를 재사용하고 새 fallback 직원을 만들지 않는다.

```python
shipping_svc.pickup_complete(db_session, req.request_id, actor=shipping_actor)
shipping_actions_svc.pickup_complete(db_session, request_id, actor=actor)
```

- [ ] **Step 2: 동시성 테스트 양쪽 세션에서 actor 재조회 후 전달**

```python
with make_session() as db:
    actor = db.get(Employee, actor_id)
    shipping_actions.pickup_complete(db, request_id, actor=actor)
```

스레드 밖 SQLAlchemy 객체를 재사용하지 않는다.

- [ ] **Step 3: 종결 상태 오류 계약도 actor를 전달한 뒤 상태 오류를 검증**

```python
commands = (
    lambda: shipping_actions.prepare_cancel(db, request_id, actor=actor),
    lambda: shipping_actions.pickup_complete(db, request_id, actor=actor),
    lambda: shipping_actions.pickup_cancel(db, request_id, actor=actor),
)
```

- [ ] **Step 4: 출하 서비스·동시성 묶음 확인**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/services/test_shipping.py tests/services/test_shipping_actions.py tests/concurrency/test_shipping_cancel_retry_concurrent.py tests/ops/test_inventory_cutover.py -q
```

예상: PASS. 재고 합계, 취소 원복, 활성 배정, 요청 상태 관련 기존 단언도 그대로 통과해야 한다.

---

### Task 4: 감사 증거 기반 오기록 복구 도구를 TDD로 만든다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Create: `_attic/backend-scripts/repair_shipping_pickup_actor_attribution.py`
- Create: `backend/tests/ops/test_repair_shipping_pickup_actor_attribution.py`

- [ ] **Step 1: 임시 SQLite 정상·거부 시나리오 테스트 작성**

테스트 DB에 직원 A(준비자), 직원 B(픽업자), PICKUP 거래, 연결 작업 원장, 성공 감사 로그를 만든다. 다음을 각각 검증한다.

- `test_dry_run_reports_mismatch_without_writing`
- `test_apply_updates_only_actor_attribution_columns`
- `test_apply_rejects_multiple_successful_actors_for_one_request`
- `test_apply_rejects_unknown_audit_employee`
- `test_apply_rolls_back_every_change_when_any_candidate_is_ambiguous`
- `test_no_mismatch_is_a_noop`

정상 적용 테스트는 수정 전후에 재고·상태·시각 필드의 스냅샷을 비교한다.

```python
assert after["quantity_change"] == before["quantity_change"]
assert after["quantity_before"] == before["quantity_before"]
assert after["quantity_after"] == before["quantity_after"]
assert after["picked_up_at"] == before["picked_up_at"]
assert after["status"] == before["status"]
```

- [ ] **Step 2: RED 확인**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/ops/test_repair_shipping_pickup_actor_attribution.py -q
```

예상: 복구 도구 파일이 없어 FAIL한다.

- [ ] **Step 3: 기본 dry-run과 엄격한 후보 판정 구현**

도구 계약은 다음처럼 고정한다.

```python
parser.add_argument("--database", type=Path, required=True)
parser.add_argument("--from-kst", required=True)
parser.add_argument("--to-kst", required=True)
parser.add_argument("--apply", action="store_true")
parser.add_argument("--backup-dir", type=Path)
```

후보는 `action_key='http.post.shipping.requests.id.pickup-complete'`, `outcome='success'`, 하이픈을 제거한 `related_id == shipping_request_id`, PICKUP 거래와 감사 시각 차이 60초 이내 조건으로 찾는다. 한 요청에 직원 코드가 정확히 하나이고 해당 활성/비활성 여부와 무관하게 직원 테이블에서 UUID·이름이 정확히 해석될 때만 보정 가능으로 판정한다. 감사 증거가 없는 행은 추정하지 않는다.

- [ ] **Step 4: 적용 모드의 백업·단일 트랜잭션 구현**

```python
if args.apply:
    backup_path = create_online_backup(connection, args.backup_dir)
    connection.execute("BEGIN IMMEDIATE")
    try:
        update_pickup_transaction_actors(connection, candidates)
        update_pickup_operation_actors(connection, candidates)
        verify_postconditions(connection, candidates)
    except Exception:
        connection.rollback()
        raise
    else:
        connection.commit()
```

출력은 백업 절대 경로, 후보/수정/모호 건수, 요청 ID, 변경 전후 사번만 포함한 JSON으로 남기며 PIN·토큰은 출력하지 않는다.

- [ ] **Step 5: 복구 도구 GREEN 확인**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/ops/test_repair_shipping_pickup_actor_attribution.py -q
```

예상: 모든 정상·거부·rollback 테스트 PASS.

---

### Task 5: 영향 기반 최종 검증을 한 번 수행한다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Verify only; no new production files.

- [ ] **Step 1: 변경 파일과 무관한 사용자 작업 혼입 여부 확인**

```powershell
Set-Location C:\ERP
git status --short
git diff -- backend/app/routers/shipping.py backend/app/services/shipping_actions.py backend/app/services/shipping.py backend/tests/routers/test_shipping.py backend/tests/services/test_shipping.py backend/tests/services/test_shipping_actions.py backend/tests/concurrency/test_shipping_cancel_retry_concurrent.py backend/tests/ops/test_inventory_cutover.py frontend/lib/__tests__/api-core.test.ts _attic/backend-scripts/repair_shipping_pickup_actor_attribution.py backend/tests/ops/test_repair_shipping_pickup_actor_attribution.py
```

예상: 나열한 파일의 변경만 이번 작업으로 설명 가능하며 기존 무관한 작업은 건드리지 않았다.

- [ ] **Step 2: 직접 관련 테스트 재실행**

```powershell
Set-Location C:\ERP\backend
python -m pytest tests/routers/test_shipping.py tests/services/test_shipping.py tests/services/test_shipping_actions.py tests/concurrency/test_shipping_cancel_retry_concurrent.py tests/ops/test_inventory_cutover.py tests/ops/test_repair_shipping_pickup_actor_attribution.py -q
Set-Location C:\ERP\frontend
npm test -- lib/__tests__/api-core.test.ts lib/__tests__/api-shipping.test.ts
```

예상: 모두 PASS.

- [ ] **Step 3: 최종 게이트 범위 미리보기 후 백엔드 게이트 한 번 실행**

현재 작업 트리에 무관한 미커밋 변경이 있으므로 먼저 범위를 확인한다.

```powershell
Set-Location C:\ERP
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -PlanOnly
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode backend
```

예상: backend gate PASS. 무관한 기존 변경 때문에 실패하면 실패 명령과 이번 변경의 관련성을 분리해 보고하며 검사를 완화하지 않는다. 커밋·푸시를 별도로 요청받으면 이번 작업 파일만 stage한 뒤 필수 `-Mode smart -ChangeSet staged` 게이트를 추가 실행한다.

---

### Task 6: 직원 서버 코드 배포와 기존 오기록 복구를 승인 게이트 아래 수행한다 `[GPT-5.6 Terra] [순차]`

**Files:**
- Runtime only: `C:\ERP-dev\backend\mes.db`
- Evidence: `C:\ERP\_attic\runtime\shipping-pickup-actor-repair\$repairRunStamp\`

- [ ] **Step 1: 배포 범위 안전성 확인**

`sync-to-employee.ps1`는 `C:\ERP` 전체 코드를 미러링한다. 아래 결과에 이번 작업 외 미커밋 코드가 남아 있으면 직원 서버 배포를 중단하고 사용자에게 정리/격리 방향을 요청한다.

```powershell
Set-Location C:\ERP
git status --short
powershell -ExecutionPolicy Bypass -File .\scripts\dev\sync-to-employee.ps1 -DryRun -ReportActivity
```

예상: 변경 목록과 최근 활동을 확인할 수 있다. `-Force`로 수동 우회하지 않는다.

- [ ] **Step 2: 안전한 범위가 확인된 뒤 코드만 직원 서버에 배포**

```powershell
powershell -ExecutionPolicy Bypass -File C:\ERP\scripts\dev\sync-to-employee.ps1
```

예상: 최종 exit 0, 검증된 직원 DB 백업 생성, 8010 `/health/live`, 3000 HTTP 200, duplicate/unmanaged/port conflict 없음. `mes.db`는 코드 복사에서 제외된다.

- [ ] **Step 3: 직원 DB 변경 영향 설명 후 복구 dry-run**

적용 전 사용자에게 “재고·수량·상태·시각은 그대로 두고 PICKUP 담당자 이름/직원 ID와 연결 작업 원장의 작업자만 보정한다”고 다시 알린다.

```powershell
$repairFromKst = "2026-09-14T00:00:00+09:00"
$repairToKst = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
python C:\ERP\_attic\backend-scripts\repair_shipping_pickup_actor_attribution.py `
  --database C:\ERP-dev\backend\mes.db `
  --from-kst $repairFromKst `
  --to-kst $repairToKst
```

예상: `apply=false`, 모호 0, 현재 확인된 두 요청이 김현우(E06)→김건호(E04) 후보로 출력된다. 추가 후보가 있으면 자동 적용하지 않고 사용자에게 목록과 근거를 보고한다.

- [ ] **Step 4: 정확히 검토된 후보만 단일 트랜잭션으로 적용**

```powershell
$repairRunStamp = Get-Date -Format yyyyMMdd-HHmmss
$repairEvidence = "C:\ERP\_attic\runtime\shipping-pickup-actor-repair\$repairRunStamp"
New-Item -ItemType Directory -Force -Path $repairEvidence | Out-Null
python C:\ERP\_attic\backend-scripts\repair_shipping_pickup_actor_attribution.py `
  --database C:\ERP-dev\backend\mes.db `
  --from-kst $repairFromKst `
  --to-kst $repairToKst `
  --backup-dir $repairEvidence `
  --apply
```

예상: 백업 경로가 출력되고 후보 수와 수정 수가 일치한다. 오류 시 전체 rollback되어 수정 수 0이어야 한다.

- [ ] **Step 5: DB·API·브라우저 사후검증**

동일 명령을 dry-run으로 다시 실행해 mismatch 0을 확인하고, 두 요청의 PICKUP 거래 및 `inventory_operations`가 김건호(E04)를 가리키는지 읽기 전용 조회한다. 이어 직원 서버 헬스와 사용자가 열어 둔 인앱 브라우저에서 16:12 두 출하 행의 담당자가 김건호로 보이는지 확인한다.

```powershell
powershell -ExecutionPolicy Bypass -File C:\ERP-dev\scripts\dev\status-servers.ps1
```

예상: 8010/3000 정상, 두 행 담당자 김건호, 수량 `2→0` 유지. 화면 새로고침 뒤 신규 테스트 출하를 만들지는 않는다.

---

## 완료 기준

- 준비자와 픽업자가 다른 경우 모든 PICKUP 거래 및 픽업 업무 작업 원장이 실제 픽업자를 가리킨다.
- 작업자 헤더 누락·비활성 요청은 재고·상태·원장 변경 없이 거부된다.
- 기존 준비자 정보는 그대로 유지된다.
- 관련 백엔드·프런트 테스트와 최종 backend gate가 통과한다.
- 직원 DB 보정은 감사 증거가 단일한 행만 대상으로 하며 적용 전 백업, 적용 후 mismatch 0과 재고 불변을 증명한다.
- 직원 서버의 문제 두 행이 김건호로 표시되고 서비스 헬스가 정상이다.
- 커밋·푸시는 별도 요청 없이는 수행하지 않는다.
