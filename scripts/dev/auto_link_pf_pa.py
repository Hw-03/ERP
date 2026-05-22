"""PF-PA BOM 자동 연결 스크립트.

PA 품목명에서 정확히 ``_가방 포장 완료`` 접미사를 제거한 base 와 일치하는 PF
품목을 찾아 BOM (parent=PF, child=PA, quantity=1) 링크를 만든다.

매칭 못 한 PA(예: "ASS'Y" 형식)는 자연스럽게 큐에서 빠진다.

실행:
    python scripts/dev/auto_link_pf_pa.py            # dry-run (기본). DB 무변경.
    python scripts/dev/auto_link_pf_pa.py --apply    # POST /api/bom 호출로 실제 INSERT.

apply 모드는 로컬 백엔드(http://localhost:8010)가 떠있어야 한다.
중복(409)은 정상 skip 으로 집계.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest
import json

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SUFFIX = "_가방 포장 완료"
BACKEND_URL = "http://localhost:8010"
DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "mes.db"
NOTES_TAG = "auto-linked PF-PA 2026-05-22"


def load_pairs() -> tuple[list[dict], list[dict], list[dict]]:
    """(matched, unmatched_pa, pf_index_dump) 반환.

    matched: [{pa_id, pa_name, pa_unit, pf_id, pf_name}]
    unmatched_pa: 접미사 제거 base 가 PF 에 없는 PA 행
    pf_index_dump: 디버깅용 (이번엔 안 씀)
    """
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    pa_rows = con.execute(
        "SELECT item_id, item_name, unit FROM items WHERE process_type_code='PA' ORDER BY item_name"
    ).fetchall()
    pf_rows = con.execute(
        "SELECT item_id, item_name FROM items WHERE process_type_code='PF' ORDER BY item_name"
    ).fetchall()
    con.close()

    pf_index: dict[str, dict] = {r["item_name"]: dict(r) for r in pf_rows}

    matched: list[dict] = []
    unmatched_pa: list[dict] = []
    for pa in pa_rows:
        name = pa["item_name"]
        if not name.endswith(SUFFIX):
            unmatched_pa.append(dict(pa))
            continue
        base = name[: -len(SUFFIX)]
        pf = pf_index.get(base)
        if pf is None:
            unmatched_pa.append(dict(pa))
            continue
        matched.append({
            "pa_id": pa["item_id"],
            "pa_name": pa["item_name"],
            "pa_unit": pa["unit"] or "EA",
            "pf_id": pf["item_id"],
            "pf_name": pf["item_name"],
        })
    return matched, unmatched_pa, list(pf_index.values())


def fetch_existing_bom_keys() -> set[tuple[str, str]]:
    """이미 존재하는 BOM (parent_id, child_id) 집합 -- DB 직접 조회.

    apply 전에 사전 카운트 / skip 예측에 사용.
    """
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT parent_item_id, child_item_id FROM bom").fetchall()
    con.close()
    return {(r[0], r[1]) for r in rows}


def post_bom(parent_id: str, child_id: str, unit: str) -> tuple[int, str]:
    """POST /api/bom -- (status_code, body_text)."""
    payload = {
        "parent_item_id": parent_id,
        "child_item_id": child_id,
        "quantity": 1,
        "unit": unit,
        "notes": NOTES_TAG,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        f"{BACKEND_URL}/api/bom",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urlerror.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return e.code, body


def print_table(matched: list[dict], existing_keys: set[tuple[str, str]]) -> None:
    print(f"\n[매칭쌍] {len(matched)}건")
    print(f"{'':2}  {'PF (parent)':50}  ->  PA (child)")
    print("-" * 130)
    for i, m in enumerate(matched, 1):
        flag = " (이미 등록)" if (m["pf_id"], m["pa_id"]) in existing_keys else ""
        print(f"{i:2d}  {m['pf_name']:50.50}  ->  {m['pa_name']}{flag}")


def main() -> int:
    parser = argparse.ArgumentParser(description="PF-PA BOM 자동 연결")
    parser.add_argument("--apply", action="store_true", help="실제 POST 실행. 미지정 시 dry-run.")
    args = parser.parse_args()

    matched, unmatched_pa, _ = load_pairs()
    existing = fetch_existing_bom_keys()

    print(f"=== PF-PA 자동 연결 {'APPLY' if args.apply else 'DRY-RUN'} ===")
    print(f"DB: {DB_PATH}")
    print(f"매칭 알고리즘: PA item_name 끝에서 '{SUFFIX}' 제거 후 PF item_name 정확 일치")

    print_table(matched, existing)

    new_pairs = [m for m in matched if (m["pf_id"], m["pa_id"]) not in existing]
    already = len(matched) - len(new_pairs)
    print(f"\n[요약] 매칭 {len(matched)}건 / 이미 등록 {already}건 / 신규 대상 {len(new_pairs)}건")

    if unmatched_pa:
        print(f"\n[자동 매칭 안 된 PA] {len(unmatched_pa)}건 -- 시연 후 수동 검토")
        for r in unmatched_pa:
            print(f"  - {r['item_name']}")

    if not args.apply:
        print("\n(dry-run) DB 무변경. --apply 옵션을 붙이면 실제 POST /api/bom 실행.")
        return 0

    if not new_pairs:
        print("\n신규 대상 0건 -- 아무것도 하지 않음.")
        return 0

    print(f"\n[APPLY] POST {BACKEND_URL}/api/bom × {len(new_pairs)}건")
    ok = skip = fail = 0
    for m in new_pairs:
        code, body = post_bom(m["pf_id"], m["pa_id"], m["pa_unit"])
        if code == 201:
            ok += 1
            mark = "OK"
        elif code == 409:
            skip += 1
            mark = "SKIP(409 중복)"
        else:
            fail += 1
            mark = f"FAIL({code}) {body[:120]}"
        print(f"  [{mark}] {m['pf_name'][:40]} -> {m['pa_name'][:40]}")

    print(f"\n[결과] 생성 {ok}건 / 이미 존재 {skip}건 / 실패 {fail}건")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
