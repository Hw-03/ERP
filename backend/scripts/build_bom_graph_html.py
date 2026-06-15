"""모델별 대표 PF 5개의 BOM 가계도를 인터랙티브 그래프 HTML 한 개로 생성한다 (읽기 전용).

- DB를 직접 읽으므로 서버 불필요. SELECT만, commit 없음.
- 대표 PF는 화면(capacity)과 동일하게 get_production_capacity 의 representative_items 사용.
- D3 v7 을 HTML 에 인라인 → 인터넷 없이 열린다(완전 self-contained).
- 레이아웃: 위→아래 피라미드. 한 부모의 자식이 많으면(>GRID_THRESHOLD) 가로 한 줄이
  아니라 여러 열(grid)로 쌓아 가로폭을 억제하고 세로로 잘 분포시킨다(커스텀 멀티컬럼 팩).
- 큰 노드 + foreignObject 로 품목명 자동 줄바꿈(글자 안 짤림). 드래그·줌·팬, 모델 드롭다운.

실행:
    cd backend
    python scripts/build_bom_graph_html.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Item
from app.routers.production import get_production_capacity
from app.services.bom import build_bom_cache

MODEL_LABEL = {"3": "DX3000", "4": "ADX4000W", "6": "ADX6000FB", "7": "COCOON", "8": "SOLO", "9": "신제품"}
MAX_DEPTH = 10
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
D3_PATH = os.path.join(SCRIPT_DIR, "vendor", "d3.v7.min.js")
OUT_PATH = os.path.join(SCRIPT_DIR, "bom_family_graph.html")


def build_tree(item_id, cache, items_map, visiting, depth):
    item = items_map.get(item_id)
    node = {
        "code": item.mes_code if item else None,
        "name": item.item_name if item else "(알 수 없는 품목)",
        "type": item.process_type_code if item else None,
        "children": [],
    }
    if depth > MAX_DEPTH or item_id in visiting:
        return node
    nv = visiting | {item_id}
    for child_id, _qty in cache.get(item_id, []):
        node["children"].append(build_tree(child_id, cache, items_map, nv, depth + 1))
    return node


def count_nodes(node):
    return 1 + sum(count_nodes(c) for c in node["children"])


def main():
    if not os.path.exists(D3_PATH):
        print(f"[오류] D3 번들이 없습니다: {D3_PATH}", file=sys.stderr)
        print("       curl -sSL --ssl-no-revoke https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js -o 위경로", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        caps = get_production_capacity(db)
        reps = caps.get("representative_items", [])
        bom_cache = build_bom_cache(db)
        items_map = {i.item_id: i for i in db.query(Item).all()}
        by_code = {i.mes_code: i for i in items_map.values() if i.mes_code}

        models = []
        summary = []
        for rep in reps:
            root = by_code.get(rep.get("mes_code"))
            if not root:
                continue
            tree = build_tree(root.item_id, bom_cache, items_map, frozenset(), 0)
            ms = rep.get("model_symbol") or ""
            label = MODEL_LABEL.get(ms) or (root.item_name or "").split("_")[0]
            models.append({"key": ms, "label": label, "code": root.mes_code, "tree": tree})
            summary.append(f"{label} ({root.mes_code}): {count_nodes(tree)} 노드")
    finally:
        db.close()

    with open(D3_PATH, encoding="utf-8") as f:
        d3_js = f.read()
    data_json = json.dumps(models, ensure_ascii=False)

    doc = HTML_TEMPLATE.replace("@@D3@@", d3_js).replace("@@DATA@@", data_json)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(doc)

    print(f"생성 완료: {OUT_PATH}")
    print(f"모델 {len(models)}개")
    for s in summary:
        print(f"  - {s}")


HTML_TEMPLATE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BOM 가계도 — 모델별 대표 완제품</title>
<style>
  body { margin:0; font-family:"Malgun Gothic","Segoe UI",Arial,sans-serif; background:#eef1f6; color:#152238; }
  .topbar { display:flex; align-items:center; gap:12px; padding:10px 18px;
    background:#fff; border-bottom:1px solid #d4dbe8; box-shadow:0 1px 4px rgba(20,40,80,.04); }
  .topbar h1 { font-size:16px; margin:0; font-weight:800; }
  .topbar select, .topbar button { font:inherit; font-size:14px; padding:6px 12px;
    border:1px solid #cdd5e3; border-radius:8px; background:#fff; color:#152238; }
  .topbar button { cursor:pointer; }
  .topbar button:hover { border-color:#4472c4; color:#244a86; }
  .hint { color:#8a93a5; font-size:12px; margin-left:auto; }
  .legend { display:flex; gap:12px; align-items:center; padding:7px 18px;
    background:#fff; border-bottom:1px solid #e6ebf2; font-size:12px; color:#697386; flex-wrap:wrap; }
  .legend i { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  #canvas { width:100vw; height:calc(100vh - 100px); display:block; cursor:grab; background:#eef1f6; }
  #canvas:active { cursor:grabbing; }
  .links path { fill:none; stroke:#b3c4e3; stroke-width:1.6px; }
  .node { cursor:move; }
  .node rect.box { fill:#fff; stroke:#d4dbe8; stroke-width:1.4px; filter:drop-shadow(0 1px 2px rgba(20,40,80,.10)); }
  .node:hover rect.box { stroke:#4472c4; stroke-width:2px; }
  /* foreignObject 안의 HTML 카드 (자동 줄바꿈으로 글자 안 짤림) */
  .card { box-sizing:border-box; width:100%; height:100%; display:flex; flex-direction:column;
    justify-content:center; padding:7px 11px 7px 15px; overflow:hidden;
    font-family:"Malgun Gothic","Segoe UI",Arial,sans-serif; pointer-events:none; }
  .card .code { font:700 15px/1.15 Consolas,"Courier New",monospace; color:#1f2a44; letter-spacing:.2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .card .nm { margin-top:3px; font-size:13px; line-height:1.22; color:#5a6473;
    white-space:normal; word-break:break-word; overflow-wrap:anywhere;
    display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
</style>
</head>
<body>
<div class="topbar">
  <h1>BOM 가계도</h1>
  <label style="font-size:14px;color:#697386;">모델</label>
  <select id="model"></select>
  <button id="fit">화면 맞춤</button>
  <span class="hint">휠 = 줌 · 빈 공간 드래그 = 이동 · 노드 드래그 = 옮기기</span>
</div>
<div class="legend" id="legend"></div>
<svg id="canvas"></svg>

<script>@@D3@@</script>
<script>window.MODELS = @@DATA@@;</script>
<script>
(function () {
  // ── 노드/간격 치수 (큰 노드) ───────────────────────────────
  const W = 260, H = 68;          // 노드 박스
  const HGAP = 26;                // 형제 간 가로 간격
  const VGAP = 64;                // 부모→자식 세로 간격 (행 사이)
  const GRID_THRESHOLD = 3;       // 자식이 이보다 많으면 grid 로 쌓는다 (가로폭 억제)
  const COLS = 3;                 // grid 열 수 (좁게 → 세로로 쌓임)
  const COL_GAP = 26;             // grid 열 사이 가로 간격
  const ROW_GAP = 26;             // grid 행 사이 세로 간격

  const LEGEND = [
    ["완제품", "#244a86"], ["출하", "#4472c4"], ["조립", "#3f8fa3"],
    ["튜닝", "#8b65d8"], ["진공", "#a78bdc"], ["고압", "#e3b341"],
    ["튜브", "#2d9eb3"], ["원자재", "#aeb6c4"],
  ];

  function nodeColor(type) {
    if (!type) return "#9aa7bd";
    if (type === "PF") return "#244a86";
    const p = type[0], s = type[type.length - 1];
    if (s === "R") return "#aeb6c4";              // 원자재 (?R)
    const map = { P:"#4472c4", A:"#3f8fa3", N:"#8b65d8", V:"#a78bdc", H:"#e3b341", T:"#2d9eb3" };
    return map[p] || "#9aa7bd";
  }

  // ── 커스텀 멀티컬럼 팩 레이아웃 ────────────────────────────
  // 각 노드에 _w(서브트리 폭), _h(서브트리 높이)를 1차로 계산하고
  // 2차로 (x, y) 절대좌표를 배치한다. 부모는 자식 블록의 가로 중앙에 둔다.
  function measure(node) {
    const kids = node.children || [];
    if (!kids.length) {
      node._w = W;
      node._h = H;
      return;
    }
    kids.forEach(measure);

    if (kids.length <= GRID_THRESHOLD) {
      // 가로 한 줄: 자식 서브트리 폭의 합
      let sum = 0;
      kids.forEach((k, i) => { sum += k._w + (i ? HGAP : 0); });
      node._w = Math.max(W, sum);
      node._h = H + VGAP + Math.max(...kids.map((k) => k._h));
      node._grid = false;
    } else {
      // grid: COLS 열로 나눠 행마다 쌓는다.
      const rows = Math.ceil(kids.length / COLS);
      const colW = new Array(COLS).fill(0);
      const rowH = new Array(rows).fill(0);
      kids.forEach((k, i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        if (k._w > colW[c]) colW[c] = k._w;
        if (k._h > rowH[r]) rowH[r] = k._h;
      });
      let gw = 0; let usedCols = Math.min(COLS, kids.length);
      for (let c = 0; c < usedCols; c++) gw += colW[c] + (c ? COL_GAP : 0);
      let gh = 0;
      for (let r = 0; r < rows; r++) gh += rowH[r] + (r ? ROW_GAP : 0);
      node._w = Math.max(W, gw);
      node._h = H + VGAP + gh;
      node._grid = true;
      node._colW = colW;
      node._rowH = rowH;
      node._rows = rows;
      node._usedCols = usedCols;
    }
  }

  // cx = 이 서브트리 블록의 가로 중앙 x, top = 블록 상단 y
  function place(node, cx, top) {
    node.x = cx;
    node.y = top + H / 2;
    const kids = node.children || [];
    if (!kids.length) return;

    const childTop = top + H + VGAP;

    if (!node._grid) {
      // 한 줄: 자식 블록 전체 폭을 cx 중앙으로 정렬
      let total = 0;
      kids.forEach((k, i) => { total += k._w + (i ? HGAP : 0); });
      let cursor = cx - total / 2;
      kids.forEach((k) => {
        place(k, cursor + k._w / 2, childTop);
        cursor += k._w + HGAP;
      });
    } else {
      const { _colW: colW, _rowH: rowH, _rows: rows, _usedCols: usedCols } = node;
      let gw = 0;
      for (let c = 0; c < usedCols; c++) gw += colW[c] + (c ? COL_GAP : 0);
      const left = cx - gw / 2;
      const colCenter = new Array(usedCols);
      let acc = left;
      for (let c = 0; c < usedCols; c++) {
        colCenter[c] = acc + colW[c] / 2;
        acc += colW[c] + COL_GAP;
      }
      const rowTop = new Array(rows);
      let accY = childTop;
      for (let r = 0; r < rows; r++) {
        rowTop[r] = accY;
        accY += rowH[r] + ROW_GAP;
      }
      kids.forEach((k, i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        place(k, colCenter[c], rowTop[r]);
      });
    }
  }

  function layout(treeData) {
    const root = d3.hierarchy(treeData);
    measure(root);
    place(root, 0, 0);
    return root;
  }

  // ── SVG / 줌 ───────────────────────────────────────────────
  const svg = d3.select("#canvas");
  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.04, 2.5]).on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoom);

  let currentRoot = null;

  function linkPath(d) {
    // 부모 하단 → 자식 상단 으로 부드러운 세로 곡선
    const sx = d.source.x, sy = d.source.y + H / 2;
    const tx = d.target.x, ty = d.target.y - H / 2;
    const my = (sy + ty) / 2;
    return `M${sx},${sy}C${sx},${my} ${tx},${my} ${tx},${ty}`;
  }

  function render(model) {
    g.selectAll("*").remove();
    const root = layout(model.tree);
    currentRoot = root;

    const linkSel = g.append("g").attr("class", "links").selectAll("path")
      .data(root.links()).join("path").attr("d", linkPath);

    function updateLinks() { linkSel.attr("d", linkPath); }

    const node = g.append("g").selectAll("g.node")
      .data(root.descendants()).join("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .call(d3.drag()
        .on("start", (e) => { e.sourceEvent.stopPropagation(); })
        .on("drag", function (e, d) {
          d.x = e.x; d.y = e.y;
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
          updateLinks();
        }));

    // 박스 + 좌측 컬러 바
    node.append("rect").attr("class", "box")
      .attr("x", -W / 2).attr("y", -H / 2).attr("width", W).attr("height", H).attr("rx", 9);
    node.append("rect")
      .attr("x", -W / 2).attr("y", -H / 2).attr("width", 6).attr("height", H)
      .attr("fill", (d) => nodeColor(d.data.type));

    // foreignObject 안에 HTML 카드 → 품목명 자동 줄바꿈(wrap), 글자 안 짤림
    const fo = node.append("foreignObject")
      .attr("x", -W / 2 + 6).attr("y", -H / 2).attr("width", W - 6).attr("height", H);
    fo.append("xhtml:div").attr("class", "card")
      .html((d) => {
        const code = (d.data.code || "·");
        const nm = (d.data.name || "");
        const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="code">${esc(code)}</div><div class="nm">${esc(nm)}</div>`;
      });

    // 전체 이름 툴팁 (hover 시 안 짤린 풀네임)
    node.append("title").text((d) => (d.data.code ? d.data.code + "  " : "") + (d.data.name || ""));

    fit(root);
  }

  function fit(root) {
    const ns = root.descendants();
    if (!ns.length) return;
    const xs = ns.map((d) => d.x), ys = ns.map((d) => d.y);
    const minX = Math.min(...xs) - W, maxX = Math.max(...xs) + W;
    const minY = Math.min(...ys) - H, maxY = Math.max(...ys) + H;
    const bw = maxX - minX, bh = maxY - minY;
    const sw = svg.node().clientWidth, sh = svg.node().clientHeight;
    const scale = Math.min(sw / bw, sh / bh, 1.2);
    const tx = sw / 2 - scale * (minX + maxX) / 2;
    const ty = sh / 2 - scale * (minY + maxY) / 2;
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  // ── 드롭다운 / 범례 / 버튼 ────────────────────────────────
  const sel = d3.select("#model");
  sel.selectAll("option").data(window.MODELS).join("option")
    .attr("value", (d, i) => i).text((d) => `${d.label}  (${d.code})`);
  sel.on("change", function () { render(window.MODELS[+this.value]); });

  d3.select("#legend").selectAll("span").data(LEGEND).join("span")
    .html((d) => `<i style="background:${d[1]}"></i>${d[0]}`);

  d3.select("#fit").on("click", () => { if (currentRoot) fit(currentRoot); });
  window.addEventListener("resize", () => { if (currentRoot) fit(currentRoot); });

  if (window.MODELS && window.MODELS.length) { sel.property("value", 0); render(window.MODELS[0]); }
})();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
