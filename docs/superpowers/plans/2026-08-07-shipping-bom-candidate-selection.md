> **추천 모델: GPT-5.6 Terra** - DB 영속 상태, FastAPI 계약, React 단계 UI를 함께 바꾸는 중간 규모 데이터 흐름 변경입니다.
> **추천 추론 수준: 높음** - 후보 검증과 최종 품목 확정 시점의 회귀 위험을 함께 다뤄야 합니다.
> **권장 실행 형태: 단독 순차 실행** - 백엔드 계약이 먼저 확정돼야 프런트 상태와 테스트를 안전하게 연결할 수 있습니다.

# 출하 BOM 후보 선택 구현 계획

> **For agentic workers:** `executing-plans` 절차로 한 작업씩 구현하고, 각 작업의 대상 테스트를 통과시킨 뒤 다음 작업으로 진행한다.

**GOAL:** 출하 BOM 수정 시 동일 PF 후보를 모두 제시하고, 사용자의 명시적 선택 없이는 기준 PF를 다른 국가·판매처 품목으로 전환하지 않는다.

**Goal:** 기준 PF 유지, 기존 후보 재사용, 신규 생성의 세 가지 최종화 방식을 출하 요청에 저장하고 UI·서버에서 동일하게 검증한다.

**Architecture:** BOM 매칭 API는 단일 자동 매칭 결과 대신 기준 PF 일치 여부와 여러 PF 후보를 반환한다. 출하 요청은 최종화 방식과 선택한 후보 PF를 저장하며, 서버가 저장·준비 중 전환 시 선택값과 현재 BOM의 일치를 검증해 최종 PA/PF를 확정한다. 기준 PF와 동일한 BOM은 항상 기준 PF를 유지하고, 후보 재사용은 사용자가 선택한 경우에만 허용한다.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, Pydantic, React/TypeScript, TanStack Query, Vitest, pytest.

---

## 실행 전략

**추천 모델: GPT-5.6 Terra** — 백엔드·프런트엔드·DB 계약을 함께 변경한다.

**추천 추론 수준: 높음** — 최종 품목 확정과 기존 출하 준비 흐름의 회귀를 막기 위해 필요하다.

**팀 구성: 불필요** — API 타입과 UI 상태가 순차 의존하므로 한 세션에서 통합한다.

---

## 변경 파일 구조

| 파일 | 책임 |
| --- | --- |
| `backend/app/models/shipping.py` | 출하 요청의 최종화 방식과 명시적으로 고른 PF 후보 ID를 영속화 |
| `backend/alembic/versions/20260807_0014_shipping_bom_candidate_selection.py` | 운영 DB에 두 영속 열을 멱등적으로 추가 |
| `backend/app/schemas/shipping.py` | 후보 목록과 최종화 방식의 API 요청·응답 계약 |
| `backend/app/routers/shipping.py` | 새 요청/수정 요청의 최종화 선택값 전달 및 응답 직렬화 |
| `backend/app/services/shipping.py` | 전체 PF 후보 탐색, 선택값 검증, 자동 재사용 제거 |
| `backend/tests/services/test_shipping.py` | 후보 목록·기준 유지·명시 재사용·신규 생성·재검증 서비스 증명 |
| `backend/tests/routers/test_shipping.py` | HTTP 계약과 저장 후 선택값 복원 증명 |
| `frontend/lib/api/types/shipping.ts` | 서버 계약의 TypeScript 타입 |
| `frontend/app/mes/_components/DesktopShippingView.tsx` | 3단계 후보 선택, 요청 저장값, 5단계 최종 요약 |
| `frontend/app/mes/_components/__tests__/DesktopShippingView.test.tsx` | 다수 후보·명시 선택·기준 유지의 화면 회귀 테스트 |

## Task 1: 최종화 선택 계약과 DB 마이그레이션 테스트 작성 `[GPT-5.6 Terra · 순차]`

**Files:**

- Modify: `backend/app/models/shipping.py:38-93`
- Modify: `backend/app/schemas/shipping.py:29-49,135-148,270-289`
- Create: `backend/alembic/versions/20260807_0014_shipping_bom_candidate_selection.py`
- Test: `backend/tests/routers/test_shipping.py`

- [ ] **Step 1: 실패하는 HTTP 계약 테스트를 추가한다.**

```python
payload = {
    "base_pf_item_id": str(base_pf.item_id),
    "finalization_mode": "REUSE_CANDIDATE",
    "reuse_pf_item_id": str(candidate_pf.item_id),
    "bom_lines": bom_lines,
}
created = client.post("/api/shipping/requests", json=payload)
assert created.status_code == 200
assert created.json()["finalization_mode"] == "REUSE_CANDIDATE"
assert created.json()["reuse_pf_item_id"] == str(candidate_pf.item_id)
```

- [ ] **Step 2: 테스트가 현재 422 또는 응답 키 누락으로 실패하는지 실행한다.**

Run: `cd backend; pytest tests/routers/test_shipping.py -q`

Expected: 새 `finalization_mode`/`reuse_pf_item_id` 계약 테스트만 실패.

- [ ] **Step 3: 모델·Pydantic 계약과 마이그레이션을 최소 범위로 추가한다.**

```python
class ShippingFinalizationModeEnum(str, enum.Enum):
    KEEP_BASE = "KEEP_BASE"
    REUSE_CANDIDATE = "REUSE_CANDIDATE"
    CREATE_NEW = "CREATE_NEW"

# ShippingRequest
finalization_mode = Column(
    SAEnum(ShippingFinalizationModeEnum, name="shipping_finalization_mode_enum"),
    nullable=False,
    default=ShippingFinalizationModeEnum.KEEP_BASE,
    server_default=ShippingFinalizationModeEnum.KEEP_BASE.value,
)
reuse_pf_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="SET NULL"), nullable=True)
reuse_pf_item = relationship("Item", foreign_keys=[reuse_pf_item_id])
```

`ShippingRequestCreate`, `ShippingRequestUpdate`, `ShippingRequestResponse`에 같은 두 필드를 추가한다. Alembic 파일은 최신 revision `20260804_0013`를 `down_revision`으로 삼고, SQLite/PostgreSQL에서 이미 열이 있으면 건너뛰는 기존 검사 패턴을 사용한다. 새 열의 기존 행 기본값은 `KEEP_BASE`, 후보 ID는 NULL이다.

- [ ] **Step 4: 새 계약 테스트를 통과시킨다.**

Run: `cd backend; pytest tests/routers/test_shipping.py -q`

Expected: PASS.

## Task 2: 다수 후보 매칭과 명시적 최종 품목 확정 구현 `[GPT-5.6 Terra · 순차]`

**Files:**

- Modify: `backend/app/services/shipping.py:202-242,369-441,604-702`
- Modify: `backend/app/schemas/shipping.py:135-148`
- Modify: `backend/app/routers/shipping.py:170-195,415-451,710-717`
- Test: `backend/tests/services/test_shipping.py`

- [ ] **Step 1: 서비스 실패 테스트를 추가한다.**

```python
match = shipping_svc.match_bom(db_session, bom_lines=bom_lines, base_pf_item_id=base_pf.item_id)
assert match["base_pf_matches"] is False
assert [row["pf_item_id"] for row in match["pf_candidates"]] == [candidate_a.item_id, candidate_b.item_id]

req = shipping_svc.create_request(
    db_session,
    {"base_pf_item_id": base_pf.item_id, "finalization_mode": "CREATE_NEW", "custom_pa_name": "A new PA", "custom_pf_name": "A new PF", "bom_lines": bom_lines},
)
assert req.final_pf_item_id != candidate_a.item_id
assert req.final_pf_item_id != candidate_b.item_id
```

추가로 다음 세 가지를 독립 테스트로 둔다.

```python
# 수정 없는 기준 BOM은 다른 동일 후보가 있어도 기준 PF를 유지한다.
assert keep_base_request.final_pf_item_id == base_pf.item_id

# REUSE_CANDIDATE는 고른 후보 PF와 그 직접 PA를 함께 사용한다.
assert reused.final_pf_item_id == candidate_b.item_id
assert reused.final_pa_item_id == candidate_b_pa.item_id

# 후보가 요청 BOM과 달라지면 준비 중 전환 전에 ShippingError가 난다.
with pytest.raises(ShippingError, match="동일 BOM 후보"):
    shipping_svc.send_to_prep(db_session, stale_request.request_id)
```

- [ ] **Step 2: 서비스 테스트가 기존 단일 `matched_*` 반환과 자동 재사용 때문에 실패하는지 실행한다.**

Run: `cd backend; pytest tests/services/test_shipping.py -q`

Expected: 새 후보 목록·명시 선택 테스트 실패, 기존 테스트는 기존 동작을 보여줌.

- [ ] **Step 3: 단일 후보 탐색을 후보 목록 탐색으로 교체한다.**

```python
def _matching_pf_candidates(db: Session, normalized: list[dict]) -> list[dict]:
    """Return every active PF whose direct PA/PF BOM exactly matches the draft."""
    candidates: list[dict] = []
    for pf in _active_items(db, process_type_code="PF"):
        pa = _direct_pf_pa(db, pf)
        if pa is None:
            continue
        if _item_signature(db, pa.item_id) != _stage_signature_from_lines(normalized, "PA"):
            continue
        if _item_signature(db, pf.item_id) != _expected_pf_signature(normalized, pa):
            continue
        candidates.append(_candidate_payload(pf, pa))
    return sorted(candidates, key=lambda row: (row["pf_mes_code"] or "", row["pf_item_name"], str(row["pf_item_id"])))
```

`ShippingBomMatchResponse`는 `base_pf_matches: bool`와 `pf_candidates: list[ShippingBomMatchCandidate]`를 반환한다. 더 이상 `matched_pa_*`, `matched_pf_*`, `requires_*` 필드를 반환하거나 첫 후보를 선택하지 않는다.

`_resolve_final_items`는 `finalization_mode`를 분기한다.

```python
if req.finalization_mode == ShippingFinalizationModeEnum.KEEP_BASE:
    return _resolve_base_final_items_or_raise(db, req)
if req.finalization_mode == ShippingFinalizationModeEnum.REUSE_CANDIDATE:
    return _resolve_selected_candidate_or_raise(db, req)
return _create_request_owned_final_items(db, req)
```

`_resolve_selected_candidate_or_raise`는 저장된 PF가 활성 PF인지, 요청 BOM과 정확히 일치하는지, 직접 PA가 있는지를 확인한 뒤 그 PF/PA를 반환한다. `CREATE_NEW`은 시그니처로 기존 Item을 다시 찾지 않고 요청 소유의 새 PA/PF만 생성 또는 갱신한다. create/update payload가 BOM 또는 최종화 선택을 바꾸면 기존 자동 매칭 대신 이 분기를 사용한다.

- [ ] **Step 4: 라우터에서 두 필드를 서비스 payload와 응답에 연결한다.**

```python
"finalization_mode": payload.finalization_mode,
"reuse_pf_item_id": payload.reuse_pf_item_id,
```

`_to_response`에도 같은 값을 포함한다. `bom_match` 라우터는 후보 배열을 그대로 response model로 검증한다.

- [ ] **Step 5: 서비스·라우터 회귀를 통과시킨다.**

Run: `cd backend; pytest tests/services/test_shipping.py tests/routers/test_shipping.py -q`

Expected: PASS. 기존 기본 BOM 요청은 기준 PF를 유지하고, 신규 생성은 자동 재사용하지 않음.

## Task 3: 프런트 API 타입과 저장 payload 회귀 테스트 `[GPT-5.6 Terra · 순차]`

**Files:**

- Modify: `frontend/lib/api/types/shipping.ts:214-280`
- Modify: `frontend/lib/api/shipping.ts:90-120`
- Modify: `frontend/app/mes/_components/DesktopShippingView.tsx:330-380,1067-1165,1230-1255`
- Test: `frontend/app/mes/_components/__tests__/DesktopShippingView.test.tsx`

- [ ] **Step 1: 프런트 테스트에 후보 2개와 명시적 선택 payload 검증을 추가한다.**

```tsx
vi.mocked(api.matchShippingBom).mockResolvedValue({
  base_pf_matches: false,
  pf_candidates: [candidate("pf-a", "A PF", "pa-a", "A PA"), candidate("pf-b", "B PF", "pa-b", "B PA")],
})

await user.click(screen.getByTestId("shipping-bom-candidate-pf-b"))
await user.click(screen.getByRole("button", { name: "저장" }))
expect(api.createShippingRequest).toHaveBeenCalledWith(expect.objectContaining({
  finalization_mode: "REUSE_CANDIDATE",
  reuse_pf_item_id: "pf-b",
}))
```

추가 테스트는 기준 BOM일 때 후보가 있어도 `KEEP_BASE`와 기준 PF가 5단계에 남는지, 신규 생성 선택일 때 `CREATE_NEW`과 null 후보 ID가 전송되는지를 검증한다.

- [ ] **Step 2: 테스트가 이전 `matched_pf_item_id` 타입 때문에 실패하는지 실행한다.**

Run: `cd frontend; npm test -- app/mes/_components/__tests__/DesktopShippingView.test.tsx`

Expected: 새 응답 타입·테스트 ID·payload assertion 실패.

- [ ] **Step 3: 공용 타입과 화면 초안 상태를 추가한다.**

```ts
export type ShippingFinalizationMode = "KEEP_BASE" | "REUSE_CANDIDATE" | "CREATE_NEW";

export interface ShippingBomMatchCandidate {
  pf_item_id: string;
  pf_item_name: string;
  pf_mes_code: string | null;
  pa_item_id: string;
  pa_item_name: string;
  pa_mes_code: string | null;
}

export interface ShippingBomMatchResponse {
  base_pf_matches: boolean;
  pf_candidates: ShippingBomMatchCandidate[];
}
```

`DesktopShippingView`에 `finalizationMode`와 `reusePfItemId` 상태를 둔다. 기준 PF를 바꾸거나 BOM 줄을 바꾸면 후보 선택을 해제하고, 매칭 응답의 `base_pf_matches`가 참이면 `KEEP_BASE`, 거짓이면 `CREATE_NEW`를 기본값으로 둔다. 기존 요청을 열 때는 API 응답의 두 값을 초안에 복원한다.

- [ ] **Step 4: 저장 payload를 두 상태와 연결하고 대상 테스트를 통과시킨다.**

```ts
finalization_mode: finalizationMode,
reuse_pf_item_id: finalizationMode === "REUSE_CANDIDATE" ? reusePfItemId : null,
```

Run: `cd frontend; npm test -- app/mes/_components/__tests__/DesktopShippingView.test.tsx`

Expected: PASS.

## Task 4: 3단계 후보 선택과 5단계 최종 출하품 표시 구현 `[GPT-5.6 Terra · 순차]`

**Files:**

- Modify: `frontend/app/mes/_components/DesktopShippingView.tsx:2300-2670`
- Test: `frontend/app/mes/_components/__tests__/DesktopShippingView.test.tsx`

- [ ] **Step 1: 다수 후보를 모두 표시하되 자동 선택하지 않는 화면 실패 테스트를 추가한다.**

```tsx
expect(screen.getByTestId("shipping-bom-candidate-pf-a")).toHaveTextContent("A PF")
expect(screen.getByTestId("shipping-bom-candidate-pf-b")).toHaveTextContent("B PF")
expect(screen.getByTestId("shipping-bom-candidate-pf-b")).toHaveTextContent("B PA")
expect(screen.getByTestId("shipping-final-pf-summary")).not.toHaveTextContent("A PF")
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `cd frontend; npm test -- app/mes/_components/__tests__/DesktopShippingView.test.tsx`

Expected: 후보 목록과 처리 방식 UI가 아직 없어 실패.

- [ ] **Step 3: 3단계에 후보 목록과 처리 방식 선택을 구현한다.**

`base_pf_matches`가 참이면 기준 PF/PA 요약만 보인다. 거짓이고 후보가 있으면 각 후보를 하나의 radio/button 행으로 렌더링한다. 행의 test ID는 `shipping-bom-candidate-${pf_item_id}`다. 행에는 PF 코드·이름과 `연결 PA` 코드·이름을 모두 보여준다.

```tsx
<button
  data-testid={`shipping-bom-candidate-${candidate.pf_item_id}`}
  aria-pressed={finalizationMode === "REUSE_CANDIDATE" && reusePfItemId === candidate.pf_item_id}
  onClick={() => {
    props.onFinalizationMode("REUSE_CANDIDATE");
    props.onReusePfItemId(candidate.pf_item_id);
  }}
>
  <SummaryCode code={candidate.pf_mes_code ?? "-"} />
  <span>{candidate.pf_item_name}</span>
  <span>연결 PA · {candidate.pa_mes_code ?? "-"} · {candidate.pa_item_name}</span>
</button>
```

별도 `선택한 국가·판매처로 신규 생성` 버튼은 `CREATE_NEW`로 전환하고 후보 ID를 null로 비운다. `REUSE_CANDIDATE`인데 후보가 없으면 다음·저장·준비 중 전환을 막고 “재사용할 기존 품목을 선택하세요.”를 표시한다.

- [ ] **Step 4: 5단계 표시를 사용자 선택값에만 연결한다.**

`REUSE_CANDIDATE`일 때만 선택 후보의 PF/PA를 최종 요약과 출하 품목 hero에 표시한다. `KEEP_BASE`는 `basePfItem`과 그 직접 PA를 표시한다. `CREATE_NEW`은 입력한 새 PA/PF 이름과 미리보기 코드를 표시한다. 후보 배열의 첫 행을 fallback으로 사용하지 않는다.

- [ ] **Step 5: 대상 UI 테스트와 타입 검사를 통과시킨다.**

Run: `cd frontend; npm test -- app/mes/_components/__tests__/DesktopShippingView.test.tsx; npm run lint:strict`

Expected: PASS.

## Task 5: 통합 회귀와 실제 출하 흐름 검증 `[GPT-5.6 Terra · 순차]`

**Files:**

- Verify: `backend/tests/services/test_shipping.py`
- Verify: `backend/tests/routers/test_shipping.py`
- Verify: `frontend/app/mes/_components/__tests__/DesktopShippingView.test.tsx`

- [ ] **Step 1: 백엔드와 프런트의 직접 영향 테스트를 다시 실행한다.**

Run:

```powershell
cd backend
pytest tests/services/test_shipping.py tests/routers/test_shipping.py -q
cd ..\frontend
npm test -- app/mes/_components/__tests__/DesktopShippingView.test.tsx
```

Expected: 모두 PASS.

- [ ] **Step 2: DB 마이그레이션을 개발 DB에 적용한다.**

DB에 `shipping_requests.finalization_mode`와 `shipping_requests.reuse_pf_item_id`가 추가된다. 기존 요청은 `KEEP_BASE`로 해석되며 데이터 삭제는 없다.

Run: `cd backend; python bootstrap_db.py --all`

Expected: migration success, schema check success.

- [ ] **Step 3: 인앱 브라우저에서 실제 흐름을 확인한다.**

1. Vector 기준 PF를 선택하고 BOM을 바꾸지 않은 뒤 3·5단계가 Vector를 유지하는지 확인한다.
2. BOM을 수정해 후보가 여러 개인 상태에서 모든 후보 PF·연결 PA가 보이고 기본 선택이 신규 생성인지 확인한다.
3. 한 후보를 선택한 뒤 5단계와 저장 payload가 그 후보만 사용하는지 확인한다.
4. 다시 신규 생성을 선택해 기존 후보로 자동 전환하지 않는지 확인한다.

- [ ] **Step 4: 최종 변경 영역 게이트를 한 번 실행한다.**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode auto`

Expected: PASS.

- [ ] **Step 5: 변경 범위를 보고하고 커밋은 사용자의 별도 요청이 있을 때만 수행한다.**

Run: `git diff --check; git status --short`

Expected: 이번 기능 파일과 사전 존재 변경을 구분해 보고할 수 있음.
