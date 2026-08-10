# OS 라이센스 라벨 생산 가능 수량 제외 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 품목 코드 4-PR-0058을 BOM과 재고 처리에는 유지하면서 AF 기준 생산 가능 수량 계산에서만 제외한다.

**Goal:** OS라이센스 라벨 재고 부족이 ADX4000W의 출하 대기·빠른 생산·총생산 값을 제한하지 않게 한다.

**Architecture:** 원본 BOM 캐시는 유지한다. 생산 가능 수량 서비스가 AF 계산에만 제외 품목이 제거된 복사 BOM 그래프를 전달해, 세 수량과 병목 표시를 함께 일관되게 계산한다.

**Tech Stack:** Python, SQLAlchemy, pytest

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** - 재귀 BOM 계산 로직과 회귀 테스트를 함께 판단해야 한다.

**추천 추론 수준: 높음** - 계산 경로를 좁게 바꾸되 기존 BOM·재고 동작을 보존해야 한다.

**실행 구성: 솔로** - 테스트와 구현이 같은 서비스 파일에서 순차 의존하므로 병렬화 이점이 없다.

---

### Task 1: 계산 제외 동작 회귀 테스트 `[GPT-5.6 Terra | 병렬 불가]`

**Files:**
- Modify: `backend/tests/services/test_production_capacity.py`

- [ ] **Step 1: 실패하는 테스트를 작성한다.**

```python
def test_af_capacity_ignores_os_license_label_requirement(
    db_session, make_item, make_bom
):
    af = make_item(name="조립 완제품", process_type_code="AF", warehouse_qty=Decimal("0"))
    required = make_item(name="필수 부품", process_type_code="AA", warehouse_qty=Decimal("3"))
    license_label = make_item(
        name="OS라이센스 라벨", model_symbol="4", process_type_code="PR",
        serial_no=58, warehouse_qty=Decimal("0"),
    )
    pf = make_item(name="출하 완제품", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(af.item_id, required.item_id, Decimal("1"))
    make_bom(pf.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, license_label.item_id, Decimal("1"))
    db_session.commit()

    variant = _variants_for(compute_capacity(db_session), af.item_id)[0]

    assert variant["ship_ready"] == 0
    assert variant["fast_production"] == 3
    assert variant["total_production"] == 3
```

- [ ] **Step 2: 테스트가 현재 `fast_production == 0`, `total_production == 0`으로 실패하는지 확인한다.**

Run: `cd backend; python -m pytest tests/services/test_production_capacity.py -k license_label -q`

Expected: FAIL

### Task 2: AF 계산 전용 BOM 필터 구현 `[GPT-5.6 Terra | 병렬 불가]`

**Files:**
- Modify: `backend/app/services/production_capacity.py`

- [ ] **Step 1: 품목 코드 상수와 AF 계산용 BOM 필터를 최소 범위로 추가한다.**

```python
_CAPACITY_IGNORED_MES_CODES = frozenset({"4-PR-0058"})

def _capacity_bom_cache(
    bom_cache: BomCache, items_map: Dict[uuid.UUID, Item]
) -> BomCache:
    ignored_ids = {
        item_id for item_id, item in items_map.items()
        if item.mes_code in _CAPACITY_IGNORED_MES_CODES
    }
    if not ignored_ids:
        return bom_cache
    return {
        parent_id: [
            (child_id, qty) for child_id, qty in children if child_id not in ignored_ids
        ]
        for parent_id, children in bom_cache.items()
    }
```

- [ ] **Step 2: `compute_capacity()`에서 원본 `bom_cache`는 legacy 계산에 유지하고, 필터된 캐시와 역방향 캐시만 `compute_af_capacity()`에 전달한다.**

```python
capacity_bom_cache = _capacity_bom_cache(bom_cache, items_map)
af = compute_af_capacity(
    items=all_items,
    bom_cache=capacity_bom_cache,
    reverse_bom=build_reverse_bom(capacity_bom_cache),
    fig_by_id=fig_by_id,
    items_map=items_map,
)
```

- [ ] **Step 3: 대상 테스트를 실행한다.**

Run: `cd backend; python -m pytest tests/services/test_production_capacity.py -k license_label -q`

Expected: PASS

### Task 3: 영향 범위 회귀 검증 `[GPT-5.6 Terra | 병렬 불가]`

**Files:**
- Verify: `backend/tests/services/test_production_capacity.py`
- Verify: `backend/tests/routers/test_capacity.py`

- [ ] **Step 1: 생산 가능 수량 서비스와 API 테스트를 실행한다.**

Run: `cd backend; python -m pytest tests/services/test_production_capacity.py tests/routers/test_capacity.py -q`

Expected: PASS

- [ ] **Step 2: 최종 변경 범위를 검토한다.**

Run: `git diff --check; git diff -- backend/app/services/production_capacity.py backend/tests/services/test_production_capacity.py`

Expected: 공백 오류가 없고, 계산 전용 예외와 회귀 테스트만 포함한다.
