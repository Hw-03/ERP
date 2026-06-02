"""대표 PF 의 BOM 트리 깊이와 자재별 stage / 재고 분포 확인.

immediate vs maximum 차이가 왜 없는지 파악 용도.
- immediate: stage_order >= 60 (NF) 시작 재고만 인정, NF 미만은 추가 생산 X
- maximum: 맨 아래 leaf 까지 전부 인정
"""
import sqlite3
import sys
from pathlib import Path


def main() -> None:
    db = Path(__file__).resolve().parents[1] / "mes.db"
    con = sqlite3.connect(db)
    cur = con.cursor()

    # stage_order 매핑
    stage_by_code = dict(
        cur.execute("SELECT code, stage_order FROM process_types").fetchall()
    )

    # 대표 PF 목록 (모델별 자연 정렬 첫 PF)
    rows = cur.execute(
        """
        SELECT item_id, mes_code, item_name, model_symbol
        FROM items
        WHERE process_type_code='PF' AND model_symbol IS NOT NULL
        ORDER BY model_symbol, COALESCE(mes_code, item_name)
        """
    ).fetchall()
    rep_by_model: dict[str, tuple] = {}
    for r in rows:
        ms = r[3]
        if ms in rep_by_model:
            continue
        rep_by_model[ms] = r

    print(f"== 대표 PF {len(rep_by_model)}종의 BOM 트리 분석 ==\n")

    for ms, (item_id, code, name, _) in sorted(rep_by_model.items()):
        print(f"== 모델{ms} - {code} {name[:60]}")
        analyze_tree(cur, item_id, stage_by_code)
        print()

    con.close()


def analyze_tree(cur, root_id: str, stage_by_code: dict[str, int]) -> None:
    """BFS 로 트리 펼치고, 각 자재의 stage / 재고 / 깊이 출력."""
    visited: set[str] = set()
    # (item_id, depth, parent_code)
    queue: list[tuple[str, int, str]] = [(root_id, 0, "")]
    max_depth = 0
    stage_distribution: dict[int, int] = {}
    leaf_count = 0
    below_nf_stages: list[tuple[str, str, int, float]] = []  # NF 미만 자식

    while queue:
        new_queue: list[tuple[str, int, str]] = []
        for item_id, depth, _parent in queue:
            if item_id in visited:
                continue
            visited.add(item_id)
            max_depth = max(max_depth, depth)

            row = cur.execute(
                "SELECT i.mes_code, i.item_name, i.process_type_code, "
                "       COALESCE(inv.warehouse_qty,0)+COALESCE(inv.pending_quantity,0) "
                "FROM items i LEFT JOIN inventory inv ON inv.item_id=i.item_id "
                "WHERE i.item_id=?",
                (item_id,),
            ).fetchone()
            if not row:
                continue
            code, name, ptype, avail = row
            stage = stage_by_code.get(ptype, 0)
            stage_distribution[stage] = stage_distribution.get(stage, 0) + 1

            children = cur.execute(
                "SELECT child_item_id, quantity FROM bom WHERE parent_item_id=?",
                (item_id,),
            ).fetchall()
            if not children:
                leaf_count += 1

            if depth == 1 and stage < 60:
                below_nf_stages.append((code, name[:30], stage, float(avail)))

            for child_id, _qty in children:
                new_queue.append((child_id, depth + 1, code))
        queue = new_queue

    print(f"  max_depth = {max_depth}")
    print(f"  leaf_count = {leaf_count}")
    print(f"  unique items visited = {len(visited)}")
    print(f"  stage_distribution = {dict(sorted(stage_distribution.items()))}")
    if below_nf_stages:
        print(f"  ! depth=1 자식 중 stage<60 ({len(below_nf_stages)}건) - immediate 가 차단되는 지점:")
        for code, name, stage, avail in below_nf_stages[:5]:
            print(f"    - stage={stage} {code} {name} (avail={avail})")
    else:
        print("  + depth=1 자식 모두 stage>=60 - immediate 가 깊이 1 자식 재고로 결정됨")


if __name__ == "__main__":
    main()
