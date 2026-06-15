"""모델별 대표 PF 5개의 BOM 가계도를 인터랙티브 그래프 HTML 한 개로 생성한다 (읽기 전용).

- DB를 직접 읽으므로 서버 불필요. SELECT만, commit 없음.
- 대표 PF는 화면(capacity)과 동일하게 get_production_capacity 의 representative_items 사용.
- D3 v7 을 HTML 에 인라인 → 인터넷 없이 열린다(완전 self-contained).
- 레이아웃: 공정 단계(stage_order)를 세로 레벨로 고정한 layered 피라미드.
  같은 단계(완제품/조립/원자재 등)는 같은 가로 띠에 정렬되어 위→아래로 층층이 내려간다.
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
  .bandlabel { font:800 22px "Malgun Gothic","Segoe UI",sans-serif; fill:#aab4c4; }
  .links path { fill:none; stroke:#b3c4e3; stroke-width:2.2px; }
  .node { cursor:pointer; }
  .node rect.box { fill:#fff; stroke:#d4dbe8; stroke-width:2px; filter:drop-shadow(0 2px 4px rgba(20,40,80,.10)); }
  .node:hover rect.box { stroke:#4472c4; stroke-width:3px; }
  .node, .links path { transition:opacity .15s ease; }
  .node.dim { opacity:.12; }
  .links path.dim { opacity:.06; }
  .node.sel rect.box { stroke:#244a86; stroke-width:4px; }
  /* foreignObject 안의 HTML 카드 (자동 줄바꿈으로 글자 안 짤림) */
  .card { box-sizing:border-box; width:100%; height:100%; display:flex; flex-direction:column;
    justify-content:center; padding:12px 16px 12px 22px; overflow:hidden;
    font-family:"Malgun Gothic","Segoe UI",Arial,sans-serif; pointer-events:none; }
  .card .code { font:700 22px/1.15 Consolas,"Courier New",monospace; color:#1f2a44; letter-spacing:.2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .card .nm { margin-top:5px; font-size:18px; line-height:1.25; color:#5a6473;
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
  <span class="hint">단계별 정렬 · 휠 = 줌 · 빈 공간 드래그 = 이동 · 노드 클릭 = 하위 하이라이트</span>
</div>
<div class="legend" id="legend"></div>
<svg id="canvas"></svg>

<script>@@D3@@</script>
<script>window.MODELS = @@DATA@@;</script>
<script>
(function () {
  // ── 치수 ───────────────────────────────────────────────────
  const W = 400, H = 118;       // 노드 박스
  const HGAP = 38;              // 같은 단계 내 형제 가로 간격
  const BAND_GAP = 160;         // 단계(밴드) 사이 세로 간격
  const SLOT = W + HGAP;
  const PAD_L = 320;            // 좌측 단계 라벨 공간

  // ── 부서순 × FAR 고정 18단계 ───────────────────────────────
  // 위→아래: 출하 → 조립 → 튜닝 → 진공 → 고압 → 튜브, 각 부서 안 완료(F)→중간(A)→원자재(R)
  const LEVELS = [
    ["PF", "완제품"], ["PA", "출하 중간"], ["PR", "출하 원자재"],
    ["AF", "조립 완료"], ["AA", "조립 중간"], ["AR", "조립 원자재"],
    ["NF", "튜닝 완료"], ["NA", "튜닝 중간"], ["NR", "튜닝 원자재"],
    ["VF", "진공 완료"], ["VA", "진공 중간"], ["VR", "진공 원자재"],
    ["HF", "고압 완료"], ["HA", "고압 중간"], ["HR", "고압 원자재"],
    ["TF", "튜브 완료"], ["TA", "튜브 중간"], ["TR", "튜브 원자재"],
  ];
  const LEVEL_INDEX = {};
  LEVELS.forEach((lv, i) => { LEVEL_INDEX[lv[0]] = i; });
  const EXTRA_INDEX = LEVELS.length;  // 코드 매칭 안 되는 노드 → 맨 아래 "기타"
  function levelOf(t) { return (t && LEVEL_INDEX[t] != null) ? LEVEL_INDEX[t] : EXTRA_INDEX; }

  const LEGEND = [
    ["완제품", "#244a86"], ["출하", "#4472c4"], ["조립", "#3f8fa3"],
    ["튜닝", "#8b65d8"], ["진공", "#a78bdc"], ["고압", "#e3b341"],
    ["튜브", "#2d9eb3"], ["원자재", "#aeb6c4"],
  ];
  function nodeColor(type) {
    if (!type) return "#9aa7bd";
    if (type === "PF") return "#244a86";
    const p = type[0], s = type[type.length - 1];
    if (s === "R") return "#aeb6c4";
    const map = { P:"#4472c4", A:"#3f8fa3", N:"#8b65d8", V:"#a78bdc", H:"#e3b341", T:"#2d9eb3" };
    return map[p] || "#9aa7bd";
  }

  // ── 단계 레이어 레이아웃 ───────────────────────────────────
  // x: d3.tree 로 부모 정렬 가로 위치만 사용. y: 공정 stage_order 별 고정 밴드.
  function layout(treeData) {
    const MAX_COLS = 12, ROW_GAP = 55, EMPTY_H = H;  // 빈 단계도 한 줄 높이 유지
    const root = d3.hierarchy(treeData);
    const nodes = root.descendants();
    nodes.forEach((d) => { d.level = levelOf(d.data.type); });
    const hasExtra = nodes.some((d) => d.level === EXTRA_INDEX);
    const total = LEVELS.length + (hasExtra ? 1 : 0);
    const bands = [];
    let y = 0;
    for (let li = 0; li < total; li++) {
      const arr = nodes.filter((d) => d.level === li);  // DFS 등장 순
      const cols = Math.max(1, Math.min(MAX_COLS, arr.length));
      const rows = arr.length ? Math.ceil(arr.length / cols) : 1;
      arr.forEach((d, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        d.x = (c - (cols - 1) / 2) * SLOT;              // 단계 블록을 가로 중앙 정렬
        d.y = y + r * (H + ROW_GAP) + H / 2;
      });
      const bandH = arr.length ? rows * (H + ROW_GAP) - ROW_GAP : EMPTY_H;
      bands.push({
        label: li < LEVELS.length ? LEVELS[li][1] : "기타",
        top: y, height: bandH, empty: arr.length === 0,
        newDept: li < LEVELS.length && li % 3 === 0,    // 부서 시작(3단위)
      });
      y += bandH + BAND_GAP;
    }
    return { root, nodes, bands };
  }

  // ── SVG / 줌 ───────────────────────────────────────────────
  const svg = d3.select("#canvas");
  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.03, 2.5]).on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoom);
  let cur = null;

  function linkPath(d) {
    const sx = d.source.x, sy = d.source.y + H / 2;
    const tx = d.target.x, ty = d.target.y - H / 2;
    const my = (sy + ty) / 2;
    return `M${sx},${sy}C${sx},${my} ${tx},${my} ${tx},${ty}`;
  }

  function render(model) {
    g.selectAll("*").remove();
    const L = layout(model.tree);
    cur = L;
    const xs = L.nodes.map((d) => d.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);

    // 단계 배경 띠 + 좌측 라벨 (18단계 고정, 빈 단계는 흐리게, 부서 경계 점선)
    const bg = g.append("g");
    const fullX = minX - PAD_L, fullW = (maxX - minX) + PAD_L + 2 * W;
    L.bands.forEach((b, i) => {
      bg.append("rect")
        .attr("x", fullX).attr("y", b.top - BAND_GAP / 2)
        .attr("width", fullW).attr("height", b.height + BAND_GAP)
        .attr("fill", i % 2 ? "#e7edf5" : "#eef2f8");
      if (b.newDept && i > 0) {
        bg.append("line")
          .attr("x1", fullX).attr("y1", b.top - BAND_GAP / 2)
          .attr("x2", fullX + fullW).attr("y2", b.top - BAND_GAP / 2)
          .attr("stroke", "#bcc8de").attr("stroke-width", 1.5).attr("stroke-dasharray", "7 5");
      }
      bg.append("text").attr("class", "bandlabel")
        .attr("x", fullX + 14).attr("y", b.top + b.height / 2 + 5)
        .attr("opacity", b.empty ? 0.4 : 1)
        .text(b.label);
    });

    // 링크
    const linkSel = g.append("g").attr("class", "links").selectAll("path")
      .data(L.root.links()).join("path").attr("d", linkPath);

    // 노드 (위치 고정 — 드래그 없음, 클릭만 동작)
    let selected = null;
    const node = g.append("g").selectAll("g.node").data(L.nodes).join("g")
      .attr("class", "node").attr("transform", (d) => `translate(${d.x},${d.y})`)
      .on("click", function (e, d) { e.stopPropagation(); toggleSel(d); });

    // 클릭 → 그 노드의 모든 하위 하이라이트, 나머지 흐리게 (빈 공간 클릭 = 해제)
    function applyHL(d) {
      const isRaw = d.data.type && d.data.type.endsWith("R");
      const isInter = d.data.type && d.data.type.endsWith("A");
      let set;
      if (isRaw) {
        set = new Set(d.ancestors());
      } else {
        set = new Set(d.descendants());
        if (isInter) {
          const dept = d.data.type[0];
          d.ancestors().forEach(a => { if (a.data.type && a.data.type[0] === dept && a.data.type.endsWith("A")) set.add(a); });
        }
      }
      node.classed("dim", (n) => !set.has(n)).classed("sel", (n) => n === d);
      linkSel.classed("dim", (l) => !(set.has(l.source) && set.has(l.target)));
    }
    function clearHL() { node.classed("dim", false).classed("sel", false); linkSel.classed("dim", false); }
    function toggleSel(d) { if (selected === d) { selected = null; clearHL(); } else { selected = d; applyHL(d); } }
    svg.on("click.sel", (e) => {
      const onNode = e.target.closest && e.target.closest("g.node");
      if (!onNode) { selected = null; clearHL(); }
    });

    node.append("rect").attr("class", "box")
      .attr("x", -W / 2).attr("y", -H / 2).attr("width", W).attr("height", H).attr("rx", 14);
    node.append("rect")
      .attr("x", -W / 2).attr("y", -H / 2).attr("width", 10).attr("height", H)
      .attr("fill", (d) => nodeColor(d.data.type));

    const fo = node.append("foreignObject")
      .attr("x", -W / 2 + 10).attr("y", -H / 2).attr("width", W - 10).attr("height", H);
    fo.append("xhtml:div").attr("class", "card")
      .html((d) => {
        const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="code">${esc(d.data.code || "·")}</div><div class="nm">${esc(d.data.name)}</div>`;
      });

    node.append("title").text((d) => (d.data.code ? d.data.code + "  " : "") + (d.data.name || ""));

    fit(L);
  }

  function fit(L) {
    const ns = L.nodes;
    if (!ns.length) return;
    const xs = ns.map((d) => d.x), ys = ns.map((d) => d.y);
    const minX = Math.min(...xs) - PAD_L, maxX = Math.max(...xs) + W;
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

  d3.select("#fit").on("click", () => { if (cur) fit(cur); });
  window.addEventListener("resize", () => { if (cur) fit(cur); });

  if (window.MODELS && window.MODELS.length) { sel.property("value", 0); render(window.MODELS[0]); }
})();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
