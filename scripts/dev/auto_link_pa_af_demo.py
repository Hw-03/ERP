"""PA(부모) -> AF(자식) Jaccard 1순위 자동 연결 — 시연용.

도메인 정확성보다 시연 화면이 그럴싸하게 보이는 것을 목적으로, 각 PA 에
Jaccard 토큰 유사도 1순위 AF 를 자식으로 1:1 자동 연결한다.

도메인 룰: ASS'Y 형식 액세서리 PA 5개는 AF 자식 불가 -> 제외.
- ADX6000 스탠드 브라켓 조인트 ASS'Y
- AllMyT For ADX6000 ASS'Y / AllMyT For DX3000 ASS'Y
- Chest & Bed For ADX6000 ASS'Y / Podiatry For ADX6000 ASS'Y

실행:
    python scripts/dev/auto_link_pa_af_demo.py            # dry-run
    python scripts/dev/auto_link_pa_af_demo.py --apply    # POST /api/bom
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_URL = "http://localhost:8010"
DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "mes.db"
NOTES_TAG = "auto-linked PA-AF demo 2026-05-22"

ACCESSORY_PA_NAMES = {
    "ADX6000 스탠드 브라켓 조인트 ASS'Y",
    "AllMyT For ADX6000 ASS'Y",
    "AllMyT For DX3000 ASS'Y",
    "Chest & Bed For ADX6000 ASS'Y",
    "Podiatry For ADX6000 ASS'Y",
}

STOPWORDS = {
    "가방", "포장", "완료",
    "ass", "ass'y", "for",
    "the", "and", "or",
    "ea", "kit", "set",
}


def tokenize(name: str) -> set[str]:
    if not name:
        return set()
    s = name.lower()
    s = re.sub(r"(\d+(?:\.\d+)?)([a-z가-힣]+)", r"\1 \2", s)
    s = re.sub(r"([a-z가-힣]+)(\d+)", r"\1 \2", s)
    s = re.sub(r"[_/,\[\]\(\)'~\-\.\+]", " ", s)
    return {t for t in s.split() if t} - STOPWORDS


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def load_pairs() -> tuple[list[dict], list[str]]:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    pa_rows = con.execute(
        "SELECT item_id, item_name, unit FROM items WHERE process_type_code='PA' ORDER BY item_name"
    ).fetchall()
    af_rows = con.execute(
        "SELECT item_id, item_name, unit FROM items WHERE process_type_code='AF' ORDER BY item_name"
    ).fetchall()
    existing = {
        (r[0], r[1]) for r in con.execute("SELECT parent_item_id, child_item_id FROM bom").fetchall()
    }
    con.close()

    af_tokens = [(r, tokenize(r["item_name"])) for r in af_rows]

    pairs: list[dict] = []
    skipped_accessory: list[str] = []
    for pa in pa_rows:
        if pa["item_name"] in ACCESSORY_PA_NAMES:
            skipped_accessory.append(pa["item_name"])
            continue
        pa_tok = tokenize(pa["item_name"])
        best = None
        best_score = -1.0
        for af, af_tok in af_tokens:
            score = jaccard(pa_tok, af_tok)
            if score > best_score:
                best_score = score
                best = af
        if best is None:
            continue
        pairs.append({
            "pa_id": pa["item_id"],
            "pa_name": pa["item_name"],
            "af_id": best["item_id"],
            "af_name": best["item_name"],
            "af_unit": best["unit"] or "EA",
            "score": round(best_score, 3),
            "already": (pa["item_id"], best["item_id"]) in existing,
        })
    return pairs, skipped_accessory


def post_bom(parent_id: str, child_id: str, unit: str) -> tuple[int, str]:
    payload = {
        "parent_item_id": parent_id,
        "child_item_id": child_id,
        "quantity": 1,
        "unit": unit,
        "notes": NOTES_TAG,
    }
    req = urlrequest.Request(
        f"{BACKEND_URL}/api/bom",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urlerror.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    pairs, skipped = load_pairs()
    new_pairs = [p for p in pairs if not p["already"]]

    print(f"=== PA-AF Jaccard 1순위 자동 연결 {'APPLY' if args.apply else 'DRY-RUN'} ===")
    print(f"PA(액세서리 제외): {len(pairs)}건  /  신규 대상: {len(new_pairs)}건  /  이미 등록: {len(pairs) - len(new_pairs)}건")
    print(f"제외(액세서리): {len(skipped)}건 — {', '.join(skipped)}\n")

    print(f"{'#':2}  {'score':>5}  PA(부모)  ->  AF(자식 1순위)")
    print("-" * 130)
    for i, p in enumerate(pairs, 1):
        flag = " (이미 등록)" if p["already"] else ""
        print(f"{i:2d}  {p['score']:>5}  {p['pa_name'][:55]:55} -> {p['af_name'][:55]}{flag}")

    if not args.apply:
        print("\n(dry-run) DB 무변경. --apply 옵션을 붙이면 POST /api/bom 실행.")
        return 0

    if not new_pairs:
        print("\n신규 대상 0건 — 아무것도 하지 않음.")
        return 0

    print(f"\n[APPLY] POST {BACKEND_URL}/api/bom × {len(new_pairs)}건")
    ok = skip = fail = 0
    for p in new_pairs:
        code, body = post_bom(p["pa_id"], p["af_id"], p["af_unit"])
        if code == 201:
            ok += 1
            mark = "OK"
        elif code == 409:
            skip += 1
            mark = "SKIP(409)"
        elif code == 400 and "순환" in body:
            fail += 1
            mark = "FAIL(순환)"
        else:
            fail += 1
            mark = f"FAIL({code})"
        print(f"  [{mark}] {p['pa_name'][:40]} -> {p['af_name'][:40]}")

    print(f"\n[결과] 생성 {ok}건 / 이미 존재 {skip}건 / 실패 {fail}건")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
