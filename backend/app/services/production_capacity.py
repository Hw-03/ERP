"""생산 가능 수량 계산.

한 응답에 두 경로를 담는다.

1. `compute_legacy_capacity` — 기존 PF 합산 기준
   (`immediate` / `maximum` / `top_items` / `representative_items`).
   라우터에서 1:1 이전한 것으로 **값·의미를 완전히 보존**한다.
2. `compute_af_capacity` — 신규 AF(조립 완제품) 기준
   (`ship_ready` / `fast_assembly` / `total_production`).

세 AF 수량 정의:

- **fast_assembly**(빠른 조립 가능) : 기존 AF 재고 ＋ 직계 자재로 추가 조립 가능한 수.
  1레벨만 본다(자식의 하위 BOM 미전개). *순수 추가 생산량이 아니라 기존 AF 재고를
  포함한 총 대응량*이다.
- **total_production**(총 생산 가능) : AF 아래 전체 BOM 을 재귀로 펼친 이론 최대
  (기존 AF 재고 포함).
- **ship_ready**(출하 준비 가능) : 특정 PF 주문 기준. PF 한 종을 만들 때의 AF 요구량으로
  AF 재고를 cap 하고, PF→AF 상위 출하/포장 구간 자재 부족분으로 제한한다.
  PF별 값이 1차 정의이고, AF 요약값은 그 변형들 중 **최대값**(낙관적 대표)이다.

모든 수량은 `StockFigures.available`(warehouse＋production−pending)을 기준으로 한다.
이는 **계획/대응 수량 지표**이며, 생산 등록 가능성 검증(backflush, `warehouse_available`)이
아니다.
"""

from __future__ import annotations

import uuid
from collections import deque
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Item, ProcessType
from app.services import stock_math
from app.services.bom import BomCache, build_bom_cache

# BOM 재귀 전개 최대 깊이 — 사이클/과도한 깊이 방어용.
_BUILDABLE_MAX_DEPTH = 10
# legacy immediate 모드에서 "완제품/반제품"으로 간주하는 stage_order 하한.
# 이 미만(원자재 등)은 추가 생산 없이 보유 재고만 인정한다.
_NF_STAGE_ORDER = 60

_AF_CODE = "AF"
_PF_CODE = "PF"

# child_item_id -> List[(parent_item_id, per-unit quantity)]
ReverseBom = Dict[uuid.UUID, List[Tuple[uuid.UUID, Decimal]]]
FigById = Dict[uuid.UUID, "stock_math.StockFigures"]


# ─────────────────────────────────────────────────────────────────────────────
# 공용 헬퍼
# ─────────────────────────────────────────────────────────────────────────────
def _own_available(item_id: uuid.UUID, fig_by_id: FigById) -> int:
    """해당 품목의 가용 재고(음수 클램프, 정수)."""
    return max(int(fig_by_id.get(item_id, stock_math.StockFigures()).available), 0)


def _reduce_children(
    children: List[Tuple[uuid.UUID, Decimal]],
    *,
    recurse,
) -> Tuple[int, uuid.UUID | None]:
    """자식 BOM 으로부터 추가 생산 가능량과 병목 부품을 산정.

    각 자식의 가용 생산량 / per_unit 의 최솟값이 추가 생산 가능량(병목 기준)이다.
    추가 생산이 불가능하면 0 을 반환한다.
    """
    extra_qty = float("inf")
    bottleneck_id: uuid.UUID | None = None

    for child_id, per_unit in children:
        child_qty = recurse(child_id)
        if per_unit > 0:
            can_make = int(child_qty / per_unit)
            if can_make < extra_qty:
                extra_qty = can_make
                bottleneck_id = child_id

    if extra_qty == float("inf"):
        extra_qty = 0

    return int(extra_qty), bottleneck_id


def build_reverse_bom(bom_cache: BomCache) -> ReverseBom:
    """parent→children 캐시를 child→parents 로 뒤집는다 (역방향 BOM)."""
    reverse: ReverseBom = {}
    for parent_id, children in bom_cache.items():
        for child_id, per_unit in children:
            reverse.setdefault(child_id, []).append((parent_id, per_unit))
    return reverse


def _bottleneck_name(
    bottleneck_id: uuid.UUID | None,
    items_map: Dict[uuid.UUID, Item],
) -> Optional[str]:
    if not bottleneck_id:
        return None
    item = items_map.get(bottleneck_id)
    return item.item_name if item else None


# ─────────────────────────────────────────────────────────────────────────────
# Legacy (PF 합산) — 값·의미 1:1 보존
# ─────────────────────────────────────────────────────────────────────────────
def _legacy_buildable(
    item_id: uuid.UUID,
    *,
    bom_cache: BomCache,
    fig_by_id: FigById,
    stage_by_item: Dict[uuid.UUID, int | None],
    immediate_mode: bool,
    memo: Dict[uuid.UUID, int],
    visiting: frozenset,
    depth: int = 0,
) -> Tuple[int, uuid.UUID | None]:
    """재귀 누적 가용 생산량(buildable). Returns: (qty, bottleneck_item_id)."""
    if item_id in memo:
        return memo[item_id], None

    own = _own_available(item_id, fig_by_id)

    # 사이클 / 과도한 깊이 — memo 없이 보유분만 반환 (기존 동작 유지)
    if depth > _BUILDABLE_MAX_DEPTH or item_id in visiting:
        return own, None

    stage = stage_by_item.get(item_id)
    # immediate_mode 에서 stage < NF 이면 자식 전개 안 함 (원자재는 추가 생산 안 함)
    if immediate_mode and stage is not None and stage < _NF_STAGE_ORDER:
        memo[item_id] = own
        return own, None

    children = bom_cache.get(item_id, [])
    if not children:
        memo[item_id] = own
        return own, None

    new_visiting = visiting | frozenset([item_id])
    extra_qty, bottleneck_id = _reduce_children(
        children,
        recurse=lambda child_id: _legacy_buildable(
            child_id,
            bom_cache=bom_cache,
            fig_by_id=fig_by_id,
            stage_by_item=stage_by_item,
            immediate_mode=immediate_mode,
            memo=memo,
            visiting=new_visiting,
            depth=depth + 1,
        )[0],
    )

    total = own + extra_qty
    memo[item_id] = total
    return total, bottleneck_id


def compute_legacy_capacity(
    *,
    bom_cache: BomCache,
    fig_by_id: FigById,
    items_map: Dict[uuid.UUID, Item],
    stage_by_item: Dict[uuid.UUID, int | None],
) -> dict:
    """기존 PF 합산 생산 가능 수량 — 라우터 본문을 그대로 이전한 것."""
    empty_response = {
        "immediate": 0,
        "maximum": 0,
        "limiting_item": None,
        "status": "no_target",
        "top_items": [],
        "representative_items": [],
    }

    # BOM parent 중 다른 BOM 의 child 가 아닌 것 = 최상위 품목
    all_parent_ids = set(bom_cache.keys())
    all_child_ids = {c for children in bom_cache.values() for c, _ in children}
    top_level_ids = all_parent_ids - all_child_ids

    if not top_level_ids:
        return empty_response

    # 최상위 중 PF 만. (BOM 트리 최상위에 AF/AA 등 중간 단계가 잡혀도 시연/대시보드에서는
    # 완성품 PF 만 의미가 있음.) 정렬은 결정적으로(mes_code/item_name).
    top_items_db = [
        items_map[iid]
        for iid in top_level_ids
        if iid in items_map and items_map[iid].process_type_code == _PF_CODE
    ]
    top_items_db.sort(key=lambda it: (it.mes_code or "", it.item_name or ""))

    if not top_items_db:
        return empty_response

    top_results = []
    for item in top_items_db:
        imm, imm_btl = _legacy_buildable(
            item.item_id,
            bom_cache=bom_cache,
            fig_by_id=fig_by_id,
            stage_by_item=stage_by_item,
            immediate_mode=True,
            memo={},
            visiting=frozenset(),
        )
        mx, _ = _legacy_buildable(
            item.item_id,
            bom_cache=bom_cache,
            fig_by_id=fig_by_id,
            stage_by_item=stage_by_item,
            immediate_mode=False,
            memo={},
            visiting=frozenset(),
        )

        top_results.append({
            "item_id": str(item.item_id),
            "item_name": item.item_name,
            "mes_code": item.mes_code,
            "model_symbol": item.model_symbol,
            "is_representative": False,
            "immediate": imm,
            "maximum": mx,
            "limiting_item": _bottleneck_name(imm_btl, items_map),
        })

    if not top_results:
        return {
            "immediate": 0,
            "maximum": 0,
            "limiting_item": None,
            "status": "bom_not_registered",
            "top_items": [],
            "representative_items": [],
        }

    # 모델별 대표 PF 선정: model_symbol 별 그룹화 → 자연 정렬 첫 PF.
    representatives: Dict[str, dict] = {}
    for r in top_results:
        ms = r.get("model_symbol")
        if not ms:
            continue
        sort_key = (r.get("mes_code") or r.get("item_name") or "")
        cur = representatives.get(ms)
        if cur is None:
            representatives[ms] = r
        else:
            cur_key = (cur.get("mes_code") or cur.get("item_name") or "")
            if sort_key < cur_key:
                representatives[ms] = r
    for r in representatives.values():
        r["is_representative"] = True

    representative_items = sorted(
        representatives.values(),
        key=lambda r: (r.get("model_symbol") or ""),
    )

    total_immediate = sum(r["immediate"] for r in top_results)
    total_maximum = sum(r["maximum"] for r in top_results)

    # 전체 병목: immediate 가 가장 작은 top_item 의 병목 부품
    min_item = min(top_results, key=lambda r: r["immediate"])
    bottleneck_name = min_item.get("limiting_item")

    is_producible = any(r["immediate"] > 0 or r["maximum"] > 0 for r in top_results)
    status_value = "producible" if is_producible else "not_producible"

    return {
        "immediate": total_immediate,
        "maximum": total_maximum,
        "limiting_item": bottleneck_name,
        "status": status_value,
        "top_items": sorted(top_results, key=lambda r: r["immediate"]),
        "representative_items": representative_items,
    }


# ─────────────────────────────────────────────────────────────────────────────
# AF 기준 (신규)
# ─────────────────────────────────────────────────────────────────────────────
def _fast_assembly(
    af_id: uuid.UUID,
    *,
    bom_cache: BomCache,
    fig_by_id: FigById,
) -> Tuple[int, uuid.UUID | None]:
    """기존 AF 재고 ＋ 직계 자재로 추가 조립 가능한 수 (1레벨, 총 대응량)."""
    own = _own_available(af_id, fig_by_id)
    children = bom_cache.get(af_id, [])
    if not children:
        return own, None
    extra, bottleneck = _reduce_children(
        children,
        recurse=lambda cid: _own_available(cid, fig_by_id),
    )
    return own + extra, bottleneck


def _max_buildable(
    root_id: uuid.UUID,
    *,
    bom_cache: BomCache,
    fig_by_id: FigById,
) -> Tuple[int, uuid.UUID | None]:
    """루트 1종을 BOM 전체 재귀로 만들 수 있는 정수 최대 (기존 루트 재고 포함).

    MRP 네팅 방식: N개 생산을 가정하고 각 노드의 부족분(소요 − 보유 재고)만 자식에게
    per_unit 배로 전파한다. 공유 자식은 여러 부모의 부족분이 합산되어 **한 번만 배분**되고,
    중간 노드 자체 재고도 보존된다. feasible(N) 은 N 에 단조이므로 이분탐색으로 최대 N 을 찾는다.

    (단순 재귀 buildable 은 형제 가지가 공유하는 하위 자재를 양쪽에서 통째로 세어
    '이론 최대'를 물리적으로 불가능한 수로 부풀린다. 이 함수는 그 과대를 제거한다.)

    Returns: (최대 생산 가능 수, 한 개 더 만들 때 막히는 병목 노드 id).
    """
    # 1) 도달 가능 부분그래프 (사이클/깊이 안전)
    reach: set[uuid.UUID] = set()

    def collect(node: uuid.UUID, visiting: frozenset, depth: int) -> None:
        if depth > _BUILDABLE_MAX_DEPTH or node in visiting:
            return
        reach.add(node)
        for child, _ in bom_cache.get(node, []):
            collect(child, visiting | frozenset([node]), depth + 1)

    collect(root_id, frozenset(), 0)

    # 2) 위상 정렬 (부모를 자식보다 먼저). 부모 부족분이 모두 합산된 뒤 자식을 처리해야
    #    공유 자식이 정확히 단일 배분된다. 사이클이면 임의 순서 폴백(안전 우선).
    indeg = {n: 0 for n in reach}
    for n in reach:
        for c, _ in bom_cache.get(n, []):
            if c in indeg:
                indeg[c] += 1
    queue = deque(n for n in reach if indeg[n] == 0)
    remaining = dict(indeg)
    order: List[uuid.UUID] = []
    while queue:
        n = queue.popleft()
        order.append(n)
        for c, _ in bom_cache.get(n, []):
            if c in remaining:
                remaining[c] -= 1
                if remaining[c] == 0:
                    queue.append(c)
    if len(order) != len(reach):
        order = list(reach)  # 사이클 폴백

    def shortage_node(n: int) -> uuid.UUID | None:
        """N개 생산 시 처음으로 막히는 부족 노드. 가능하면 None."""
        required: Dict[uuid.UUID, Decimal] = {x: Decimal("0") for x in reach}
        required[root_id] = Decimal(n)
        for node in order:
            deficit = required[node] - Decimal(_own_available(node, fig_by_id))
            if deficit <= 0:
                continue
            kids = bom_cache.get(node, [])
            if not kids:
                return node  # 더 내려갈 자식 없음 = 여기서 부족
            for child, per_unit in kids:
                if child in required:
                    required[child] += deficit * per_unit
        return None

    own_root = _own_available(root_id, fig_by_id)
    # 보유 재고만큼은 항상 feasible. 한 개 더가 불가하면 곧장 종료.
    if shortage_node(own_root + 1) is not None:
        return own_root, shortage_node(own_root + 1)

    # 상한을 2배씩 키워 infeasible 지점을 찾은 뒤 이분탐색.
    lo = own_root + 1
    hi = own_root + 1
    while shortage_node(hi) is None:
        lo = hi
        hi *= 2
        if hi > 10**9:
            return lo, shortage_node(lo + 1)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if shortage_node(mid) is None:
            lo = mid
        else:
            hi = mid - 1
    return lo, shortage_node(lo + 1)


def _requirements_below(
    root_id: uuid.UUID,
    af_ids: set[uuid.UUID],
    bom_cache: BomCache,
) -> Dict[uuid.UUID, Decimal]:
    """root 1개를 만들 때 각 하위 노드의 소요 수량.

    `af_ids`(=모든 AF) 중 어느 것에 도달하면 그 아래로는 더 내려가지 않는다
    (AF 는 재고 leaf 로 취급). AF 하위 자재는 AF 재고로 이미 대표되므로 제외 —
    한 PF/PA 아래 형제 AF 가 둘 이상일 때 형제 AF 의 하위 자재가 누설되지 않게 한다.
    같은 노드가 여러 경로로 나오면 소요량을 합산한다.
    """
    req: Dict[uuid.UUID, Decimal] = {}

    def dfs(node: uuid.UUID, mult: Decimal, visiting: frozenset, depth: int) -> None:
        if depth > _BUILDABLE_MAX_DEPTH or node in visiting:
            return
        nv = visiting | frozenset([node])
        for child, per_unit in bom_cache.get(node, []):
            m = mult * per_unit
            req[child] = req.get(child, Decimal("0")) + m
            if child in af_ids:
                continue  # 모든 AF 아래로는 내려가지 않음(재고 leaf)
            dfs(child, m, nv, depth + 1)

    dfs(root_id, Decimal("1"), frozenset(), 0)
    return req


def _ship_ready_variant(
    pf_id: uuid.UUID,
    af_id: uuid.UUID,
    af_ids: set[uuid.UUID],
    *,
    bom_cache: BomCache,
    fig_by_id: FigById,
) -> Tuple[int, uuid.UUID | None]:
    """특정 PF 1종 + 대상 AF 1종 기준 출하 준비 가능 수.

    = PF 자체 재고 + min( AF 재고 / PF당 AF요구량,  PF→AF 출하/포장 구간 각 자재 / 요구량 ).
    이미 완성된 PF 재고는 부품 없이 즉시 출하 가능하므로 조립 가능량과 합산한다.
    형제 AF(피어 완제품)는 cap 대상에서 제외한다.
    """
    pf_own = _own_available(pf_id, fig_by_id)

    req = _requirements_below(pf_id, af_ids, bom_cache)
    af_req = req.get(af_id)
    if not af_req or af_req <= 0:
        return pf_own, None

    af_own = _own_available(af_id, fig_by_id)
    best = int(Decimal(af_own) / af_req)
    bottleneck: uuid.UUID | None = af_id

    for node, qty in req.items():
        if node == af_id or qty <= 0 or node in af_ids:
            continue  # 대상 AF 는 위에서 cap, 형제 AF 는 이 변형 cap 대상 아님
        node_own = _own_available(node, fig_by_id)
        can = int(Decimal(node_own) / qty)
        if can < best:
            best = can
            bottleneck = node

    return best + pf_own, bottleneck


def _pf_variant_ancestors(
    af_id: uuid.UUID,
    reverse_bom: ReverseBom,
    items_map: Dict[uuid.UUID, Item],
) -> List[uuid.UUID]:
    """AF 의 조상 중 process_type_code == 'PF' 인 품목 id 목록 (결정적 정렬)."""
    ancestors: set[uuid.UUID] = set()

    def up(node: uuid.UUID, visiting: frozenset, depth: int) -> None:
        if depth > _BUILDABLE_MAX_DEPTH or node in visiting:
            return
        nv = visiting | frozenset([node])
        for parent, _ in reverse_bom.get(node, []):
            if parent not in ancestors:
                ancestors.add(parent)
                up(parent, nv, depth + 1)

    up(af_id, frozenset(), 0)

    pfs = [
        pid
        for pid in ancestors
        if pid in items_map and items_map[pid].process_type_code == _PF_CODE
    ]
    pfs.sort(key=lambda pid: (items_map[pid].mes_code or "", items_map[pid].item_name or ""))
    return pfs


def compute_af_capacity(
    *,
    items: List[Item],
    bom_cache: BomCache,
    reverse_bom: ReverseBom,
    fig_by_id: FigById,
    items_map: Dict[uuid.UUID, Item],
) -> dict:
    """AF(조립 완제품) 기준 생산 가능 수량 블록."""
    af_items = [it for it in items if it.process_type_code == _AF_CODE]
    af_items.sort(key=lambda it: (it.model_symbol or "", it.mes_code or "", it.item_name or ""))

    if not af_items:
        return {
            "basis": "AF",
            "status": "no_target",
            "summary": {"ship_ready": 0, "fast_assembly": 0, "total_production": 0},
            "items": [],
            "pf_variants": [],
        }

    af_id_set = {it.item_id for it in af_items}
    af_rows: List[dict] = []
    variant_rows: List[dict] = []
    any_incomplete = False
    all_incomplete = True

    for af in af_items:
        af_id = af.item_id
        has_direct_children = bool(bom_cache.get(af_id))
        marked_complete = af.bom_completed_at is not None
        bom_status = "complete" if has_direct_children else "incomplete"
        if has_direct_children:
            all_incomplete = False
        else:
            any_incomplete = True

        fast_qty, fast_btl = _fast_assembly(af_id, bom_cache=bom_cache, fig_by_id=fig_by_id)
        total_qty, total_btl = _max_buildable(
            af_id, bom_cache=bom_cache, fig_by_id=fig_by_id
        )

        pf_ids = _pf_variant_ancestors(af_id, reverse_bom, items_map)
        has_pf_path = bool(pf_ids)

        best_ship = 0
        best_ship_btl: uuid.UUID | None = None
        for pf_id in pf_ids:
            v_qty, v_btl = _ship_ready_variant(
                pf_id, af_id, af_id_set, bom_cache=bom_cache, fig_by_id=fig_by_id
            )
            pf = items_map.get(pf_id)
            variant_rows.append({
                "pf_item_id": str(pf_id),
                "pf_code": pf.mes_code if pf else None,
                "pf_name": pf.item_name if pf else "(알 수 없는 품목)",
                "model_symbol": pf.model_symbol if pf else None,
                "af_item_id": str(af_id),
                "ship_ready": v_qty,
                "limiting_item": _bottleneck_name(v_btl, items_map),
                "bom_status": "complete" if (pf and bom_cache.get(pf_id)) else "incomplete",
            })
            if v_qty > best_ship:
                best_ship = v_qty
                best_ship_btl = v_btl

        af_rows.append({
            "af_item_id": str(af_id),
            "af_code": af.mes_code,
            "af_name": af.item_name,
            "model_symbol": af.model_symbol,
            "ship_ready": best_ship,
            "fast_assembly": fast_qty,
            "total_production": total_qty,
            "ship_ready_limiting_item": _bottleneck_name(best_ship_btl, items_map),
            "fast_assembly_limiting_item": _bottleneck_name(fast_btl, items_map),
            "total_production_limiting_item": _bottleneck_name(total_btl, items_map),
            "bom_status": bom_status,
            "has_direct_children": has_direct_children,
            "has_pf_path": has_pf_path,
            "marked_complete": marked_complete,
        })

    summary = {
        "ship_ready": sum(r["ship_ready"] for r in af_rows),
        "fast_assembly": sum(r["fast_assembly"] for r in af_rows),
        "total_production": sum(r["total_production"] for r in af_rows),
    }

    # status 결정 순서
    if all_incomplete:
        status = "bom_not_registered"
    elif any_incomplete:
        status = "incomplete"
    elif any(
        r["ship_ready"] > 0 or r["fast_assembly"] > 0 or r["total_production"] > 0
        for r in af_rows
    ):
        status = "producible"
    else:
        status = "not_producible"

    return {
        "basis": "AF",
        "status": status,
        "summary": summary,
        "items": af_rows,
        "pf_variants": variant_rows,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 오케스트레이션
# ─────────────────────────────────────────────────────────────────────────────
def compute_capacity(db: Session) -> dict:
    """legacy(PF 합산) + AF 기준 블록을 한 응답으로 합친다.

    BOM 캐시·재고·공정단계 맵을 한 번만 만들어 두 계산이 공유한다.
    """
    bom_cache = build_bom_cache(db)
    reverse_bom = build_reverse_bom(bom_cache)

    # 소프트 삭제 품목 제외. (소프트 삭제 시 BOM 연결도 제거되므로 legacy 경로는
    # bom_cache 기반이라 영향 없고, AF 목록만 깨끗해진다.)
    all_items = db.query(Item).filter(Item.deleted_at.is_(None)).all()
    items_map = {it.item_id: it for it in all_items}
    fig_by_id = stock_math.bulk_compute(db, [it.item_id for it in all_items])

    pt_by_code = {pt.code: pt for pt in db.query(ProcessType).all()}
    stage_by_item: Dict[uuid.UUID, int | None] = {
        it.item_id: (
            pt_by_code[it.process_type_code].stage_order
            if it.process_type_code in pt_by_code
            else None
        )
        for it in all_items
    }

    legacy = compute_legacy_capacity(
        bom_cache=bom_cache,
        fig_by_id=fig_by_id,
        items_map=items_map,
        stage_by_item=stage_by_item,
    )
    af = compute_af_capacity(
        items=all_items,
        bom_cache=bom_cache,
        reverse_bom=reverse_bom,
        fig_by_id=fig_by_id,
        items_map=items_map,
    )

    return {**legacy, "af": af}
