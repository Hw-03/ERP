"""안전재고 "200대분" 재계산 미리보기 (읽기 전용).

현재 min_stock 은 품목마다 일괄 200(= seed 기본값). 이 스크립트는 DB 를 바꾸지 않고,
"완성 본체(AF) 200대를 만들 수 있는 양"으로 다시 계산하면 각 품목의 안전재고가
얼마가 되는지를 HTML 표로 보여준다.

계산 규칙(단순화 — 2026-06-22):
- 안전재고는 **원자재 발주 대상(`?R` = TR/HR/VR/NR/AR/PR)에만** 지정. 나머지(A/F 계열 =
  조립체·완성품)는 발주하지 않으므로 안전재고 미지정.
- R 품목: min_stock = K × 200,  K = 본체 1대당 사용 개수.
  K = 모든 완성 본체(AF) BOM 에서 그 자재가 1대당 들어가는 누적 개수 중 최대값.
  모델 구분·합산 없음. (콘덴서 8개/대 → 1600, 공용 너트 1개/대 → 200)
  BOM 으로 본체 아래에 안 닿는 R 자재(포장 PR·미연결)는 K=1 로 보아 기본 200.

DB 변경 없음. 결과 HTML 만 생성한다.

실행:  cd backend && python scripts/safety_stock_preview.py
출력:  backend/scripts/safety_stock_preview.html
"""
from __future__ import annotations

import json
import os
import sqlite3
from collections import defaultdict

TARGET = 200  # 완성 본체 목표 대수

# model_symbol 한 글자 → 모델명 (CONTEXT.md product_symbols)
SYMBOL_TO_NAME = {
    "3": "DX3000",
    "7": "COCOON",
    "8": "SOLO",
    "4": "ADX4000W",
    "6": "ADX6000FB",
}

# 본체 아래에 있어야 정상인 부품 계열(미연결이면 BOM 미완성 신호)
_COMPONENT_TYPES = {
    "TR", "HR", "VR", "NR", "AR",
    "TA", "HA", "VA", "NA", "AA",
    "TF", "HF", "VF", "NF",
}

_DEPTH_CAP = 20

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "mes.db")
OUT_PATH = os.path.join(os.path.dirname(__file__), "safety_stock_preview.html")


def model_label(symbol: str | None) -> str:
    if not symbol:
        return "미지정"
    return "+".join(SYMBOL_TO_NAME.get(ch, f"?{ch}") for ch in symbol)


def model_chars(symbol: str | None) -> list[str]:
    return list(symbol) if symbol else []


def compute_rows(con) -> list:
    """items/BOM 로드 + 규칙 적용 → 화면·적용 공용 행 목록. (con 은 닫지 않음.)"""
    c = con.cursor()

    items = {}
    for iid, code, name, pt, sym, mn in c.execute(
        "SELECT item_id, mes_code, item_name, process_type_code, model_symbol, min_stock "
        "FROM items WHERE deleted_at IS NULL"
    ):
        items[iid] = {
            "id": iid,
            "code": code or "",
            "name": name or "",
            "ptype": pt or "",
            "symbol": sym,
            "min_stock": int(mn) if mn is not None else None,
        }

    bom: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for parent, child, qty in c.execute("SELECT parent_item_id, child_item_id, quantity FROM bom"):
        if parent in items and child in items:
            bom[parent].append((child, int(qty)))

    af_ids = [iid for iid, it in items.items() if it["ptype"] == "AF"]

    def explode(root: int) -> dict[int, int]:
        """root(완성 본체) 1대당 각 하위 품목의 누적 사용 개수. 다이아몬드는 합산."""
        req: dict[int, int] = defaultdict(int)

        def walk(node: int, mult: int, depth: int, path: set[int]) -> None:
            if depth > _DEPTH_CAP:
                return
            for child, qty in bom.get(node, ()):
                if child in path:  # 사이클 가드
                    continue
                req[child] += mult * qty
                walk(child, mult * qty, depth + 1, path | {child})

        walk(root, 1, 0, {root})
        return req

    # 전 AF 통틀어 1대당 사용 최대(K) + 어느 모델 본체에 쓰였는지(정보용)
    comp_k: dict[int, int] = defaultdict(int)
    comp_models: dict[int, set[str]] = defaultdict(set)
    for af in af_ids:
        req = explode(af)
        af_models = model_chars(items[af]["symbol"])
        for child, per_unit in req.items():
            if per_unit > comp_k[child]:
                comp_k[child] = per_unit
            comp_models[child].update(af_models)

    rows = []
    for iid, it in items.items():
        pt = it["ptype"]
        current = it["min_stock"]
        is_r = pt.endswith("R")  # 원자재 발주 대상

        if not is_r:  # A/F 계열 — 안전재고 대상 아님
            rows.append({
                "id": iid,
                "code": it["code"], "name": it["name"], "ptype": pt,
                "model_label": model_label(it["symbol"]),
                "per_unit": None, "used_in": "",
                "current": current, "computed": None, "delta": None,
                "basis": "대상 아님 (R 아님)",
            })
            continue

        if iid in comp_k:  # 본체 아래에서 BOM 으로 닿은 R 자재
            k = comp_k[iid]
            basis = "본체 아래 부품"
            used_in = sorted(comp_models[iid])
        else:
            k = 1
            used_in = []
            basis = "포장 (기본 200)" if pt == "PR" else "기본 200 (BOM 미연결)"

        computed = k * TARGET
        delta = computed - (current if current is not None else 0)
        rows.append({
            "id": iid,
            "code": it["code"], "name": it["name"], "ptype": pt,
            "model_label": model_label(it["symbol"]),
            "per_unit": k,
            "used_in": "·".join(model_label(m) for m in used_in) if used_in else "",
            "current": current, "computed": computed, "delta": delta,
            "basis": basis,
        })

    rows.sort(key=lambda r: r["computed"] if r["computed"] is not None else -1, reverse=True)
    return rows


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    rows = compute_rows(con)
    con.close()

    r_rows = [r for r in rows if r["computed"] is not None]
    n_up = sum(1 for r in r_rows if r["delta"] and r["delta"] > 0)
    n_unlinked = sum(1 for r in rows if r["basis"] == "기본 200 (BOM 미연결)")
    n_non_r = sum(1 for r in rows if r["computed"] is None)

    html = _render(rows, {
        "target": TARGET,
        "total": len(rows),
        "r_total": len(r_rows),
        "up": n_up,
        "unlinked": n_unlinked,
        "non_r": n_non_r,
    })
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"품목 {len(rows)}개 | 안전재고대상(R) {len(r_rows)} · 상향 {n_up} · BOM미연결 {n_unlinked} · 대상아님 {n_non_r}")
    print(f"→ {os.path.abspath(OUT_PATH)}")


def _render(rows: list[dict], summary: dict) -> str:
    data = json.dumps(rows, ensure_ascii=False)
    s = summary
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>안전재고 200대분 미리보기</title>
<style>
  body {{ margin:0; font-family:"Malgun Gothic","Segoe UI",Arial,sans-serif; background:#eef1f6; color:#152238; }}
  .top {{ padding:14px 20px; background:#fff; border-bottom:1px solid #d4dbe8; }}
  .top h1 {{ margin:0 0 4px; font-size:18px; font-weight:800; }}
  .top .sub {{ color:#697386; font-size:13px; }}
  .cards {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }}
  .card {{ background:#f6f8fc; border:1px solid #e2e8f3; border-radius:10px; padding:8px 14px; font-size:13px; }}
  .card b {{ font-size:18px; display:block; }}
  .rule {{ background:#fffbe9; border:1px solid #f0e3b0; border-radius:10px; padding:10px 14px;
           margin:12px 20px 0; font-size:12.5px; color:#6b5e2e; line-height:1.7; }}
  .rule b {{ color:#4a4115; }}
  .controls {{ display:flex; gap:8px; align-items:center; padding:12px 20px; flex-wrap:wrap; }}
  .controls input, .controls select {{ font:inherit; font-size:13px; padding:6px 10px;
    border:1px solid #cdd5e3; border-radius:8px; background:#fff; }}
  .controls input[type=search] {{ width:240px; }}
  .wrap {{ padding:0 20px 40px; }}
  table {{ width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden;
    box-shadow:0 1px 4px rgba(20,40,80,.06); font-size:13px; }}
  th, td {{ padding:8px 11px; text-align:left; border-bottom:1px solid #eef1f6; white-space:nowrap; }}
  th {{ background:#f0f3fa; font-weight:700; cursor:pointer; user-select:none; position:sticky; top:0; }}
  th:hover {{ color:#244a86; }}
  td.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
  td.k {{ text-align:center; font-weight:700; }}
  .used {{ color:#8a93a5; font-size:11.5px; }}
  .pt {{ display:inline-block; padding:1px 7px; border-radius:6px; background:#eaf0fb; color:#3a5a96; font-weight:700; font-size:11px; }}
  .up {{ color:#c0392b; font-weight:700; }}
  .down {{ color:#7f8c9b; }}
  .flag {{ display:inline-block; padding:1px 7px; border-radius:6px; font-size:11px; font-weight:700; }}
  .flag.comp {{ background:#e7f6ec; color:#2c7a4b; }}
  .flag.body {{ background:#eef0ff; color:#4a4fb0; }}
  .flag.pack {{ background:#f0f1f4; color:#8a93a5; }}
  .flag.unlinked {{ background:#fdeede; color:#9a5a1e; }}
  tr:hover td {{ background:#fafcff; }}
</style>
</head>
<body>
  <div class="top">
    <h1>안전재고 &middot; "200대분" 재계산 미리보기</h1>
    <div class="sub">원자재 발주 대상(<b>R 계열</b>)에만 안전재고 지정 — <b>1대당 사용 개수 × {s['target']}</b> · 나머지(A/F)는 미지정 · <b>DB 변경 없음, 미리보기만</b></div>
    <div class="cards">
      <div class="card">전체 품목<b>{s['total']}</b></div>
      <div class="card">안전재고 대상(R)<b>{s['r_total']}</b></div>
      <div class="card">상향(지금이 부족)<b style="color:#c0392b">{s['up']}</b></div>
      <div class="card">BOM 미연결(R)<b style="color:#9a5a1e">{s['unlinked']}</b></div>
      <div class="card">대상 아님(미지정)<b style="color:#7f8c9b">{s['non_r']}</b></div>
    </div>
  </div>
  <div class="rule">
    <b>계산 규칙</b> &nbsp;① 안전재고는 <b>원자재 발주 대상(?R = TR/HR/VR/NR/AR/PR)에만</b> — 나머지 조립체·완성품은 발주 안 하므로 <b>미지정</b> &nbsp;|&nbsp;
    ② R 품목: <b>min_stock = 1대당 사용(K) × {s['target']}</b>, K = 모든 본체 BOM 통틀어 1대당 개수의 <b>최대값</b>(모델 무시) &nbsp;|&nbsp;
    ③ 본체 아래에 안 닿는 R 자재(포장 PR·미연결)는 <b>기본 {s['target']}</b> &nbsp;|&nbsp;
    ④ "BOM 미연결"은 R 부품인데 아직 어느 본체에도 안 엮인 것 — BOM 채워지면 자동 정밀화
  </div>
  <div class="controls">
    <input type="search" id="q" placeholder="품목코드/품목명 검색">
    <select id="ptype"><option value="">공정 전체</option></select>
    <select id="basis">
      <option value="">근거 전체</option>
      <option value="본체 아래 부품">본체 아래 부품</option>
      <option value="포장 (기본 200)">포장 (기본 200)</option>
      <option value="기본 200 (BOM 미연결)">기본 200 (BOM 미연결)</option>
      <option value="대상 아님 (R 아님)">대상 아님 (R 아님)</option>
    </select>
    <label style="font-size:13px;color:#697386"><input type="checkbox" id="onlyup"> 상향(부족)만</label>
    <span id="count" style="margin-left:auto;color:#8a93a5;font-size:12px"></span>
  </div>
  <div class="wrap">
    <table>
      <thead><tr>
        <th data-k="code">품목코드</th>
        <th data-k="name">품목명</th>
        <th data-k="ptype">공정</th>
        <th data-k="model_label">모델</th>
        <th data-k="per_unit" class="num">1대당 사용</th>
        <th data-k="current" class="num">현재</th>
        <th data-k="computed" class="num">200대분(계산)</th>
        <th data-k="delta" class="num">차이</th>
        <th data-k="basis">근거</th>
      </tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
<script>
const ROWS = {data};
const tb = document.getElementById('tb');
const q = document.getElementById('q');
const fpt = document.getElementById('ptype');
const fbasis = document.getElementById('basis');
const onlyup = document.getElementById('onlyup');
const countEl = document.getElementById('count');
let sortK = 'computed', sortAsc = false;

[...new Set(ROWS.map(r => r.ptype).filter(Boolean))].sort().forEach(pt => {{
  const o = document.createElement('option'); o.value = pt; o.textContent = pt; fpt.appendChild(o);
}});

const FLAG = {{
  '본체 아래 부품':'comp', '포장 (기본 200)':'pack',
  '기본 200 (BOM 미연결)':'unlinked', '대상 아님 (R 아님)':'body'
}};

function render() {{
  const term = q.value.trim().toLowerCase();
  const pt = fpt.value, basis = fbasis.value, up = onlyup.checked;
  let list = ROWS.filter(r => {{
    if (term && !(r.code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term))) return false;
    if (pt && r.ptype !== pt) return false;
    if (basis && r.basis !== basis) return false;
    if (up && r.delta <= 0) return false;
    return true;
  }});
  list.sort((a,b) => {{
    let x = a[sortK], y = b[sortK];
    if (typeof x === 'string') return sortAsc ? x.localeCompare(y) : y.localeCompare(x);
    x = x ?? -1; y = y ?? -1;
    return sortAsc ? x - y : y - x;
  }});
  tb.innerHTML = list.map(r => {{
    const isR = r.computed !== null;
    const d = r.delta;
    const dtxt = !isR ? '<span class="down">미지정</span>'
      : (d > 0 ? `<span class="up">+${{d}}</span>` : (d < 0 ? `<span class="down">${{d}}</span>` : '0'));
    const used = r.used_in ? `<div class="used">${{r.used_in}}</div>` : '';
    const comp = isR ? `<b>${{r.computed}}</b>` : '<span style="color:#aab2c0">미지정</span>';
    const k = isR ? `×${{r.per_unit}}` : '—';
    return `<tr${{isR ? '' : ' style="background:#fbfcfe"'}}>
      <td>${{r.code}}</td>
      <td>${{r.name}}${{used}}</td>
      <td><span class="pt">${{r.ptype||'—'}}</span></td>
      <td>${{r.model_label}}</td>
      <td class="k">${{k}}</td>
      <td class="num">${{r.current ?? '—'}}</td>
      <td class="num">${{comp}}</td>
      <td class="num">${{dtxt}}</td>
      <td><span class="flag ${{FLAG[r.basis]||'pack'}}">${{r.basis}}</span></td>
    </tr>`;
  }}).join('');
  countEl.textContent = `${{list.length}} / ${{ROWS.length}} 품목`;
}}

document.querySelectorAll('th').forEach(th => th.onclick = () => {{
  const k = th.dataset.k;
  if (sortK === k) sortAsc = !sortAsc; else {{ sortK = k; sortAsc = false; }}
  render();
}});
[q, fpt, fbasis, onlyup].forEach(el => el.addEventListener('input', render));
render();
</script>
</body>
</html>"""


if __name__ == "__main__":
    main()
