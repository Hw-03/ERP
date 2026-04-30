from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime
from io import StringIO
from pathlib import Path

import openpyxl


ROOT = Path(r"C:\ERP")
SOURCE_DIR = ROOT / "outputs" / "inventory_cleanup"
OUT_DIR = ROOT / "outputs" / "bom_planner"
HTML_PATH = OUT_DIR / "bom_planner.html"
GUIDE_PATH = OUT_DIR / "BOM작업_사용안내.html"
SAMPLE_JSON_PATH = OUT_DIR / "sample_bom_draft.json"
SAMPLE_CSV_PATH = OUT_DIR / "sample_bom_export.csv"

PROCESS_ORDER = [
    "TR", "TA", "TF",
    "HR", "HA", "HF",
    "VR", "VA", "VF",
    "NR", "NA", "NF",
    "AR", "AA", "AF",
    "PR", "PA", "PF",
]


def load_items() -> tuple[list[dict], Path]:
    source = next(
        path
        for path in SOURCE_DIR.iterdir()
        if path.suffix.lower() == ".xlsx" and "공정순번" in path.name
    )
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    ws = wb["ERP_코드"]
    items: list[dict] = []
    for sort_order, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=1):
        code, name, category, quantity = (list(row) + [None, None, None, None])[:4]
        if not code or not name:
            continue
        code = str(code).strip()
        process = code.split("-")[1] if len(code.split("-")) >= 2 else ""
        category = "" if category is None else str(category).strip()
        item_name = str(name).strip()
        items.append(
            {
                "sortOrder": sort_order,
                "erpCode": code,
                "itemName": item_name,
                "category": category,
                "quantity": 0 if quantity is None else quantity,
                "processType": process,
                "searchText": f"{code} {item_name} {category} {process}".lower(),
            }
        )
    wb.close()
    if len(items) != 722:
        raise RuntimeError(f"Expected 722 items, got {len(items)}")
    if len({item["erpCode"] for item in items}) != len(items):
        raise RuntimeError("Duplicate ERP codes in source workbook")
    return items, source


def checksum_items(items: list[dict]) -> str:
    payload = json.dumps(
        [
            [
                item["sortOrder"],
                item["erpCode"],
                item["itemName"],
                item["category"],
                item["quantity"],
                item["processType"],
            ]
            for item in items
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def choose_sample_relations(items: list[dict]) -> list[dict]:
    by_process: dict[str, list[dict]] = {}
    for item in items:
        by_process.setdefault(item["processType"], []).append(item)
    parent = (by_process.get("NF") or by_process.get("AF") or by_process.get("TF") or [items[0]])[0]
    child_candidates = []
    for code in ["NR", "VF", "HR", "VR", "AR", "TR"]:
        child_candidates.extend(by_process.get(code, [])[:1])
    relations = []
    for idx, child in enumerate(child_candidates[:3], start=1):
        if child["erpCode"] == parent["erpCode"]:
            continue
        relations.append(
            {
                "id": f"sample-{idx}",
                "parentErpCode": parent["erpCode"],
                "childErpCode": child["erpCode"],
                "quantity": 1,
                "unit": "EA",
                "confirmed": idx == 1,
                "notes": "샘플 관계" if idx == 1 else "",
            }
        )
    return relations


def csv_text(rows: list[dict], items: list[dict]) -> str:
    by_code = {item["erpCode"]: item for item in items}
    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "parent_erp_code",
            "parent_item_name",
            "parent_process_type",
            "child_erp_code",
            "child_item_name",
            "child_process_type",
            "quantity",
            "unit",
            "confirmed",
            "notes",
        ]
    )
    for row in rows:
        parent = by_code[row["parentErpCode"]]
        child = by_code[row["childErpCode"]]
        writer.writerow(
            [
                row["parentErpCode"],
                parent["itemName"],
                parent["processType"],
                row["childErpCode"],
                child["itemName"],
                child["processType"],
                row["quantity"],
                row["unit"],
                "TRUE" if row["confirmed"] else "FALSE",
                row["notes"],
            ]
        )
    return "\ufeff" + output.getvalue()


def app_html(items: list[dict], source: Path, checksum: str, generated_at: str) -> str:
    items_json = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    meta_json = json.dumps(
        {
            "sourceFile": source.name,
            "itemCount": len(items),
            "generatedAt": generated_at,
            "checksum": checksum,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    process_json = json.dumps(PROCESS_ORDER, ensure_ascii=False, separators=(",", ":"))
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BOM 구성 작업</title>
  <style>
    :root {{
      --bg:#f5f6f7; --panel:#fff; --soft:#fafafa; --line:#d9dee5; --line2:#b8c1cc;
      --text:#1f252c; --muted:#687380; --accent:#167c80; --accent2:#0d6469;
      --accent-soft:#e1f3f2; --warn:#91620d; --warn-soft:#fff5d7;
      --danger:#b93434; --danger-soft:#fdeaea; --ok:#237047; --ok-soft:#e7f5ec;
      --blue:#315f9b; --blue-soft:#eaf2ff; --shadow:0 10px 30px rgba(20,31,43,.08);
    }}
    *{{box-sizing:border-box}} html,body{{height:100%}}
    body{{margin:0;background:var(--bg);color:var(--text);font:14px "Malgun Gothic","Segoe UI",Arial,sans-serif;letter-spacing:0}}
    button,input,textarea,select{{font:inherit;letter-spacing:0}}
    button{{border:1px solid var(--line);background:#fff;color:var(--text);border-radius:6px;padding:8px 10px;cursor:pointer;white-space:nowrap}}
    button:hover{{border-color:var(--accent);color:var(--accent2)}} button:disabled{{opacity:.45;cursor:not-allowed}}
    button.primary{{background:var(--accent);border-color:var(--accent);color:#fff}} button.primary:hover{{background:var(--accent2);color:#fff}}
    button.danger{{border-color:#efb4b4;color:var(--danger)}} button.icon{{width:32px;height:32px;padding:0;display:inline-grid;place-items:center}}
    button.small{{padding:5px 8px;font-size:12px}} input,textarea,select{{width:100%;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--text);padding:8px 9px;outline:none}}
    input:focus,textarea:focus,select:focus{{border-color:var(--accent);box-shadow:0 0 0 3px rgba(22,124,128,.13)}} textarea{{min-height:70px;resize:vertical}}
    .app{{min-height:100%;display:grid;grid-template-rows:auto auto 1fr auto}}
    .topbar{{background:var(--panel);border-bottom:1px solid var(--line);padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px}}
    .brand{{display:flex;align-items:baseline;gap:12px;min-width:0}} h1{{margin:0;font-size:20px;line-height:1.2}} .source{{color:var(--muted);font-size:12px}}
    .top-actions{{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}} .statline{{display:flex;gap:8px;align-items:center;flex-wrap:wrap}}
    .pill{{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:5px 9px;background:#fff;color:var(--muted);font-size:12px}}
    .pill.ok{{background:var(--ok-soft);border-color:#b8ddc6;color:var(--ok)}} .pill.warn{{background:var(--warn-soft);border-color:#eed48d;color:var(--warn)}} .pill.error{{background:var(--danger-soft);border-color:#f0b3b3;color:var(--danger)}} .pill.info{{background:var(--blue-soft);border-color:#bbd4f8;color:var(--blue)}}
    .controlbar{{display:grid;grid-template-columns:1fr auto;gap:12px;padding:10px 18px;background:#fbfbfb;border-bottom:1px solid var(--line)}}
    .chips{{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}} .chip{{border-radius:999px;padding:6px 10px;font-size:12px;background:#fff;color:var(--muted)}} .chip.active{{background:var(--accent);border-color:var(--accent);color:#fff}}
    .toggles{{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}} .toggle{{display:inline-flex;align-items:center;gap:7px;color:var(--muted);user-select:none;white-space:nowrap;font-size:13px}} .toggle input{{width:auto;accent-color:var(--accent)}}
    .mode-tabs{{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}} .mode-tabs button{{border:0;border-radius:0;border-right:1px solid var(--line)}} .mode-tabs button:last-child{{border-right:0}} .mode-tabs button.active{{background:var(--accent);color:#fff}}
    .workspace{{min-height:0;display:grid;grid-template-columns:minmax(260px,29%) minmax(420px,42%) minmax(270px,29%);gap:12px;padding:12px 18px}}
    .panel{{min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}}
    .panel-header{{padding:12px;border-bottom:1px solid var(--line);display:grid;gap:9px;background:var(--soft)}} .panel-title{{display:flex;align-items:center;justify-content:space-between;gap:8px}} .panel-title h2{{margin:0;font-size:15px}} .panel-title span{{color:var(--muted);font-size:12px}}
    .scroll-list{{min-height:0;overflow:auto;padding:8px}} .item-card{{width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:7px;padding:9px;display:grid;gap:5px;margin-bottom:7px}} .item-card:hover{{border-color:var(--accent);color:var(--text)}} .item-card.active{{border-color:var(--accent);background:var(--accent-soft)}} .item-card[draggable=true]{{cursor:grab}}
    .item-code{{font-weight:700;color:#111820;font-size:13px}} .item-name{{color:var(--text);line-height:1.35;word-break:keep-all;overflow-wrap:anywhere}} .item-meta{{display:flex;gap:6px;flex-wrap:wrap;color:var(--muted);font-size:12px}} .meta-tag{{border:1px solid var(--line);border-radius:999px;padding:2px 6px;background:#fff}}
    .status-badge{{justify-self:start;border-radius:999px;padding:2px 7px;font-size:11px;border:1px solid var(--line)}} .status-done{{background:var(--ok-soft);border-color:#b8ddc6;color:var(--ok)}} .status-warn{{background:var(--warn-soft);border-color:#eed48d;color:var(--warn)}} .status-empty{{background:#fff;color:var(--muted)}}
    .selected-parent{{padding:12px;border-bottom:1px solid var(--line);display:grid;gap:8px}} .selected-parent .code{{font-size:16px;font-weight:800;color:#111820}} .selected-parent .name{{font-size:15px;line-height:1.35}} .parent-actions{{display:flex;gap:8px;align-items:center;flex-wrap:wrap}}
    .bom-dropzone{{min-height:0;overflow:auto;padding:10px;flex:1;transition:background .15s,outline-color .15s;outline:2px dashed transparent;outline-offset:-8px}} .bom-dropzone.dragover{{background:#f0f8f7;outline-color:var(--accent)}} .empty-state{{height:100%;min-height:180px;display:grid;place-items:center;color:var(--muted);text-align:center;padding:20px}}
    .bom-row{{border:1px solid var(--line);border-radius:7px;background:#fff;margin-bottom:8px;padding:9px;display:grid;grid-template-columns:1fr 78px 72px 82px auto;gap:8px;align-items:center}} .bom-row.warn-row{{border-color:#e7c46a;background:#fffaf0}} .bom-row.error-row{{border-color:#efb4b4;background:#fff2f2}}
    .child-summary{{min-width:0}} .child-summary .name{{font-size:13px;color:var(--text);overflow-wrap:anywhere}} .qty-input{{text-align:right}} .confirm-box{{display:flex;justify-content:center;align-items:center;gap:5px;font-size:12px;color:var(--muted)}} .confirm-box input{{width:auto;accent-color:var(--accent)}}
    .tree-node{{border-left:2px solid var(--line);margin-left:8px;padding-left:10px;margin-bottom:8px}} .tree-head{{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;border:1px solid var(--line);border-radius:7px;background:#fff;padding:8px}} .tree-children{{margin-top:8px}}
    .candidate-wrap{{display:grid;grid-template-columns:1fr auto;gap:7px;margin-bottom:7px}} .candidate-wrap .item-card{{margin:0}} .quick-add{{display:grid;grid-template-columns:1fr auto;gap:7px}}
    .validation{{border-top:1px solid var(--line);background:var(--panel);padding:10px 18px;display:grid;gap:8px;max-height:220px;overflow:auto}} .validation-head{{display:flex;align-items:center;justify-content:space-between;gap:10px}} .validation h2{{margin:0;font-size:15px}} .warnings{{display:grid;gap:6px}} .issue{{border:1px solid #ead388;background:var(--warn-soft);color:#614100;border-radius:7px;padding:7px 9px;font-size:13px;text-align:left}} .issue.error{{border-color:#f0b3b3;background:var(--danger-soft);color:var(--danger)}} .issue.ok{{border-color:#b8ddc6;background:var(--ok-soft);color:var(--ok)}}
    .modal-backdrop{{position:fixed;inset:0;background:rgba(17,24,32,.42);display:none;align-items:center;justify-content:center;padding:18px;z-index:50}} .modal-backdrop.open{{display:flex}} .modal{{width:min(560px,100%);background:#fff;border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.28);border:1px solid var(--line);overflow:hidden}} .modal header{{padding:14px 16px;border-bottom:1px solid var(--line);background:var(--soft)}} .modal header h2{{margin:0;font-size:17px}} .modal-body{{padding:16px;display:grid;gap:12px}} .form-grid{{display:grid;grid-template-columns:1fr 110px;gap:10px}} .field label{{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}} .modal-actions{{padding:12px 16px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px}}
    .file-input{{display:none}} .review-only{{display:none}} body.review .review-only{{display:inline-flex}}
    @media (max-width:980px){{.workspace{{grid-template-columns:1fr}}.panel{{min-height:420px}}.controlbar{{grid-template-columns:1fr}}.toggles{{justify-content:flex-start}}.topbar{{align-items:stretch;flex-direction:column}}.top-actions{{justify-content:flex-start}}.bom-row{{grid-template-columns:1fr 70px 62px auto}}.bom-row .confirm-box{{grid-column:2/4;justify-content:flex-start}}}}
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <h1>BOM 구성 작업</h1>
        <span class="source">722개 품목 · {generated_at} 생성 · 원장 {checksum}</span>
      </div>
      <div class="top-actions">
        <div class="statline" id="stats"></div>
        <button id="saveJsonBtn">작업파일 저장</button>
        <button id="loadJsonBtn">작업파일 불러오기</button>
        <button id="exportCsvBtn">CSV 내보내기</button>
        <button id="exportFinalCsvBtn" class="primary">확정 CSV</button>
        <button id="exportReviewCsvBtn">검수 CSV</button>
        <button id="undoBtn" disabled>되돌리기</button>
        <button id="resetBtn" class="danger">초기화</button>
        <input id="jsonFileInput" class="file-input" type="file" accept=".json,application/json">
        <input id="csvFileInput" class="file-input" type="file" accept=".csv,text/csv">
      </div>
    </header>
    <section class="controlbar">
      <div class="chips" id="processChips" aria-label="공정 필터"></div>
      <div class="toggles">
        <input id="workerName" style="width:160px" placeholder="작업자명">
        <label class="toggle"><input type="checkbox" id="allowedOnly" checked> 허용 후보만</label>
        <div class="mode-tabs">
          <button id="draftModeBtn" class="active">담당자</button>
          <button id="reviewModeBtn">검수자</button>
        </div>
      </div>
    </section>
    <main class="workspace">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>상위 품목</h2><span id="parentCount"></span></div>
          <input id="parentSearch" type="search" placeholder="코드 / 품명 / 분류 검색" autocomplete="off">
        </div>
        <div class="scroll-list" id="parentList"></div>
      </section>
      <section class="panel">
        <div id="selectedParent" class="selected-parent"></div>
        <div id="bomDropzone" class="bom-dropzone"></div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title"><h2>하위 품목 후보</h2><span id="childCount"></span></div>
          <div class="quick-add"><input id="directCode" placeholder="ERP 코드 직접 입력"><button id="directAddBtn">추가</button></div>
          <input id="childSearch" type="search" placeholder="코드 / 품명 / 분류 검색" autocomplete="off">
        </div>
        <div class="scroll-list" id="childList"></div>
      </section>
    </main>
    <section class="validation">
      <div class="validation-head">
        <h2>검증 결과</h2>
        <span id="validationSummary" class="pill"></span>
      </div>
      <div id="warnings" class="warnings"></div>
    </section>
  </div>
  <div id="addModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="addModalTitle">
    <div class="modal">
      <header><h2 id="addModalTitle">하위 품목 추가</h2></header>
      <div class="modal-body">
        <div id="modalParentSummary" class="item-card"></div>
        <div id="modalChildSummary" class="item-card"></div>
        <div class="form-grid">
          <div class="field"><label for="modalQty">소요량</label><input id="modalQty" type="number" min="0" step="0.0001" value="1"></div>
          <div class="field"><label for="modalUnit">단위</label><input id="modalUnit" type="text" value="EA"></div>
        </div>
        <label class="toggle"><input type="checkbox" id="modalConfirmed"> 확정</label>
        <div class="field"><label for="modalNotes">비고 / 검수 사유</label><textarea id="modalNotes"></textarea></div>
      </div>
      <div class="modal-actions"><button id="modalCancel">취소</button><button id="modalAdd" class="primary">추가</button></div>
    </div>
  </div>
  <script>
    const ITEMS = {items_json};
    const CATALOG = {meta_json};
    const PROCESS_ORDER = {process_json};
    const PROCESS_INDEX = Object.fromEntries(PROCESS_ORDER.map((code,index)=>[code,index]));
    const itemByCode = new Map(ITEMS.map(item=>[item.erpCode,item]));
    const parentItems = ITEMS.filter(item=>!item.processType.endsWith("R"));
    const parentCodeSet = new Set(parentItems.map(item=>item.erpCode));
    const STORAGE_KEY = "bom-planner-release-" + CATALOG.checksum;
    const storage = (()=>{{try{{if(window.localStorage)return window.localStorage}}catch(e){{}} const mem=new Map(); return {{getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),key:i=>[...mem.keys()][i]||null,get length(){{return mem.size}}}}}})();
    const state = {{
      selectedParent: parentItems.find(item=>item.processType.endsWith("F"))?.erpCode || parentItems[0]?.erpCode || ITEMS[0]?.erpCode || "",
      processFilter:"ALL", parentSearch:"", childSearch:"", allowedOnly:true, viewMode:"table", mode:"draft",
      workerName:"", relations:[], modalChild:null, lastSavedAt:null, undo:null
    }};
    const el = {{
      stats:document.getElementById("stats"), processChips:document.getElementById("processChips"), allowedOnly:document.getElementById("allowedOnly"),
      parentSearch:document.getElementById("parentSearch"), childSearch:document.getElementById("childSearch"), parentList:document.getElementById("parentList"), childList:document.getElementById("childList"),
      parentCount:document.getElementById("parentCount"), childCount:document.getElementById("childCount"), selectedParent:document.getElementById("selectedParent"), bomDropzone:document.getElementById("bomDropzone"),
      validationSummary:document.getElementById("validationSummary"), warnings:document.getElementById("warnings"), workerName:document.getElementById("workerName"),
      saveJsonBtn:document.getElementById("saveJsonBtn"), loadJsonBtn:document.getElementById("loadJsonBtn"), jsonFileInput:document.getElementById("jsonFileInput"),
      exportCsvBtn:document.getElementById("exportCsvBtn"), exportFinalCsvBtn:document.getElementById("exportFinalCsvBtn"), exportReviewCsvBtn:document.getElementById("exportReviewCsvBtn"), csvFileInput:document.getElementById("csvFileInput"),
      undoBtn:document.getElementById("undoBtn"), resetBtn:document.getElementById("resetBtn"), draftModeBtn:document.getElementById("draftModeBtn"), reviewModeBtn:document.getElementById("reviewModeBtn"),
      directCode:document.getElementById("directCode"), directAddBtn:document.getElementById("directAddBtn"),
      addModal:document.getElementById("addModal"), modalParentSummary:document.getElementById("modalParentSummary"), modalChildSummary:document.getElementById("modalChildSummary"), modalQty:document.getElementById("modalQty"), modalUnit:document.getElementById("modalUnit"), modalConfirmed:document.getElementById("modalConfirmed"), modalNotes:document.getElementById("modalNotes"), modalCancel:document.getElementById("modalCancel"), modalAdd:document.getElementById("modalAdd")
    }};
    function esc(value){{return String(value??"").replace(/[&<>'"]/g,c=>({{"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}}[c]))}}
    function norm(value){{return String(value??"").trim().toLowerCase()}}
    function allowed(parent, child){{const p=PROCESS_INDEX[parent?.processType], c=PROCESS_INDEX[child?.processType]; return p!==undefined&&c!==undefined&&c<p}}
    function qty(value){{const n=Number(value); if(!Number.isFinite(n)) return "0"; return Number.isInteger(n)?String(n):String(n).replace(/0+$/,"").replace(/\\.$/,"")}}
    function relation(parent, child, options={{}}){{return {{id:options.id||`${{Date.now()}}-${{Math.random().toString(36).slice(2)}}`,parentErpCode:parent,childErpCode:child,quantity:options.quantity??1,unit:options.unit||"EA",confirmed:Boolean(options.confirmed),notes:options.notes||""}}}}
    function cloneDraft(){{return {{workerName:state.workerName, selectedParent:state.selectedParent, relations:JSON.parse(JSON.stringify(state.relations))}}}}
    function setUndo(label){{state.undo={{label,draft:cloneDraft()}}; el.undoBtn.disabled=false; el.undoBtn.textContent=`되돌리기: ${{label}}`}}
    function loadDraft(){{try{{const raw=storage.getItem(STORAGE_KEY); if(!raw) return; const d=JSON.parse(raw); if(d.catalogChecksum&&d.catalogChecksum!==CATALOG.checksum) return; state.workerName=d.workerName||""; state.relations=Array.isArray(d.relations)?d.relations.filter(r=>itemByCode.has(r.parentErpCode)&&itemByCode.has(r.childErpCode)):[]; if(d.selectedParent&&itemByCode.has(d.selectedParent)) state.selectedParent=d.selectedParent; state.lastSavedAt=d.lastSavedAt||null}}catch(e){{console.warn(e)}}}}
    function saveDraft(){{state.lastSavedAt=new Date().toISOString(); storage.setItem(STORAGE_KEY,JSON.stringify({{catalogChecksum:CATALOG.checksum,catalogSource:CATALOG.sourceFile,workerName:state.workerName,selectedParent:state.selectedParent,relations:state.relations,lastSavedAt:state.lastSavedAt}})); renderStats()}}
    function itemCard(item, active=false, draggable=false, status=""){{return `<button class="item-card${{active?" active":""}}" data-code="${{esc(item.erpCode)}}" ${{draggable?'draggable="true"':""}}><span class="item-code">${{esc(item.erpCode)}}</span><span class="item-name">${{esc(item.itemName)}}</span><span class="item-meta"><span class="meta-tag">${{esc(item.processType)}}</span><span>${{esc(item.category||"-")}}</span><span>재고 ${{esc(qty(item.quantity))}}</span></span>${{status}}</button>`}}
    function filterItems(pool, search, processFilter){{const kw=norm(search); return pool.filter(item=>(processFilter==="ALL"||item.processType===processFilter)&&(!kw||item.searchText.includes(kw)))}}
    function issuesForParent(parentCode, issues){{return issues.filter(i=>i.parentErpCode===parentCode)}}
    function parentStatus(parentCode, issues){{const rels=state.relations.filter(r=>r.parentErpCode===parentCode); const own=issuesForParent(parentCode, issues); if(own.length) return ["경고","status-warn"]; if(rels.length) return ["완료","status-done"]; return ["미완료","status-empty"]}}
    function renderProcessChips(){{el.processChips.innerHTML=["ALL",...PROCESS_ORDER].map(code=>`<button class="chip${{state.processFilter===code?" active":""}}" data-process="${{code}}">${{code==="ALL"?"전체":code}}</button>`).join("")}}
    function renderParentList(){{const issues=buildIssues(); const parents=filterItems(parentItems,state.parentSearch,state.processFilter); el.parentCount.textContent=`${{parents.length}}개`; el.parentList.innerHTML=parents.map(item=>{{const [label,klass]=parentStatus(item.erpCode,issues); const status=`<span class="status-badge ${{klass}}">${{label}}</span>`; return itemCard(item,item.erpCode===state.selectedParent,false,status)}}).join("")||`<div class="empty-state">검색 결과 없음</div>`}}
    function renderSelectedParent(){{const parent=itemByCode.get(state.selectedParent); if(!parent){{el.selectedParent.innerHTML=`<div class="code">상위 품목 없음</div>`;return}} const rels=state.relations.filter(r=>r.parentErpCode===parent.erpCode); const complete=parentItems.filter(p=>state.relations.some(r=>r.parentErpCode===p.erpCode)).length; el.selectedParent.innerHTML=`<div class="code">${{esc(parent.erpCode)}}</div><div class="name">${{esc(parent.itemName)}}</div><div class="item-meta"><span class="meta-tag">${{esc(parent.processType)}}</span><span>${{esc(parent.category||"-")}}</span><span>하위 ${{rels.length}}건</span><span>진행 ${{complete}}/${{parentItems.length}}</span></div><div class="parent-actions"><button class="small ${{state.viewMode==="table"?"primary":""}}" data-view="table">표 보기</button><button class="small ${{state.viewMode==="tree"?"primary":""}}" data-view="tree">트리 보기</button></div>`}}
    function childScore(item,parent,kw,selected){{let score=0; if(parent&&allowed(parent,item)) score+=10000; if(!selected.has(item.erpCode)) score+=1000; if(!state.relations.some(r=>r.childErpCode===item.erpCode)) score+=400; if(kw&&item.erpCode.toLowerCase().startsWith(kw)) score+=300; if(kw&&item.itemName.toLowerCase().includes(kw)) score+=200; if(parent) score+=Math.max(0,100-Math.abs(PROCESS_INDEX[parent.processType]-PROCESS_INDEX[item.processType])*8); return score}}
    function renderChildList(){{const parent=itemByCode.get(state.selectedParent); const kw=norm(state.childSearch); const selected=new Set(state.relations.filter(r=>r.parentErpCode===state.selectedParent).map(r=>r.childErpCode)); let children=ITEMS.filter(item=>item.erpCode!==state.selectedParent&&(state.processFilter==="ALL"||item.processType===state.processFilter)&&(!state.allowedOnly||!parent||allowed(parent,item))&&(!kw||item.searchText.includes(kw))); children.sort((a,b)=>childScore(b,parent,kw,selected)-childScore(a,parent,kw,selected)||a.sortOrder-b.sortOrder); el.childCount.textContent=`${{children.length}}개`; el.childList.innerHTML=children.map(item=>{{const already=selected.has(item.erpCode); return `<div class="candidate-wrap" data-code="${{esc(item.erpCode)}}">${{itemCard(item,already,true)}}<button class="icon add-child" title="추가" ${{already?"disabled":""}}>＋</button></div>`}}).join("")||`<div class="empty-state">후보 없음</div>`}}
    function relationSeverity(rel){{const parent=itemByCode.get(rel.parentErpCode), child=itemByCode.get(rel.childErpCode); if(!parent||!child||parent.erpCode===child.erpCode||Number(rel.quantity)<=0) return "error"; if(!allowed(parent,child)||!rel.confirmed) return "warn"; return ""}}
    function renderBomRows(){{const rows=state.relations.filter(r=>r.parentErpCode===state.selectedParent); if(!rows.length){{el.bomDropzone.innerHTML=`<div class="empty-state">하위 품목을 추가하세요</div>`;return}} if(state.viewMode==="tree") return renderTree(rows); el.bomDropzone.innerHTML=rows.map(rel=>{{const child=itemByCode.get(rel.childErpCode), sev=relationSeverity(rel); return `<div class="bom-row${{sev==="warn"?" warn-row":sev==="error"?" error-row":""}}" data-id="${{esc(rel.id)}}"><div class="child-summary"><div class="item-code">${{esc(child?.erpCode||rel.childErpCode)}}</div><div class="name">${{esc(child?.itemName||"알 수 없는 품목")}}</div><div class="item-meta"><span class="meta-tag">${{esc(child?.processType||"-")}}</span><span>${{esc(child?.category||"-")}}</span></div></div><input class="qty-input" type="number" min="0" step="0.0001" value="${{esc(rel.quantity)}}" data-field="quantity"><input type="text" value="${{esc(rel.unit)}}" data-field="unit"><label class="confirm-box"><input type="checkbox" data-field="confirmed" ${{rel.confirmed?"checked":""}}> 확정</label><button class="icon danger delete-relation" title="삭제">×</button><input style="grid-column:1/-1" type="text" value="${{esc(rel.notes)}}" data-field="notes" placeholder="비고 / 검수 사유"></div>`}}).join("")}}
    function renderTree(){{const visited=new Set(); function node(code, depth=0){{const item=itemByCode.get(code); const rels=state.relations.filter(r=>r.parentErpCode===code); if(visited.has(code)) return `<div class="tree-node"><div class="tree-head">순환 참조: ${{esc(code)}}</div></div>`; visited.add(code); const children=rels.map(r=>{{const child=itemByCode.get(r.childErpCode); return `<div class="tree-node"><div class="tree-head"><div><div class="item-code">${{esc(r.childErpCode)}} × ${{esc(qty(r.quantity))}} ${{esc(r.unit)}}</div><div class="item-name">${{esc(child?.itemName||"알 수 없는 품목")}}</div></div><span class="pill ${{r.confirmed?"ok":"warn"}}">${{r.confirmed?"확정":"미확정"}}</span></div><div class="tree-children">${{node(r.childErpCode,depth+1)}}</div></div>`}}).join(""); visited.delete(code); return children||""}} el.bomDropzone.innerHTML=`<div class="tree-node"><div class="tree-head"><strong>${{esc(state.selectedParent)}}</strong><span class="pill info">root</span></div><div class="tree-children">${{node(state.selectedParent)}}</div></div>`}}
    function findCycles(){{const graph=new Map(); for(const rel of state.relations){{if(!graph.has(rel.parentErpCode)) graph.set(rel.parentErpCode,[]); graph.get(rel.parentErpCode).push(rel.childErpCode)}} const cycles=[], path=[], visiting=new Set(), visited=new Set(); function visit(code){{if(visiting.has(code)){{cycles.push([...path.slice(path.indexOf(code)),code]);return}} if(visited.has(code))return; visiting.add(code); path.push(code); for(const child of graph.get(code)||[]) visit(child); path.pop(); visiting.delete(code); visited.add(code)}} for(const code of graph.keys()) visit(code); return cycles}}
    function buildIssues(){{const issues=[], dup=new Map(), childParents=new Map(); for(const rel of state.relations){{const parent=itemByCode.get(rel.parentErpCode), child=itemByCode.get(rel.childErpCode); const key=`${{rel.parentErpCode}}=>${{rel.childErpCode}}`; dup.set(key,(dup.get(key)||0)+1); if(!childParents.has(rel.childErpCode)) childParents.set(rel.childErpCode,new Set()); childParents.get(rel.childErpCode).add(rel.parentErpCode); if(!parent) issues.push({{severity:"error",message:`상위 품목 없음: ${{rel.parentErpCode}}`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}}); if(!child) issues.push({{severity:"error",message:`하위 품목 없음: ${{rel.childErpCode}}`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}}); if(rel.parentErpCode===rel.childErpCode) issues.push({{severity:"error",message:`자기 자신을 하위로 추가: ${{rel.parentErpCode}}`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}}); if(!Number.isFinite(Number(rel.quantity))||Number(rel.quantity)<=0) issues.push({{severity:"error",message:`소요량 확인: ${{rel.parentErpCode}} → ${{rel.childErpCode}}`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}}); if(parent&&child&&!allowed(parent,child)) issues.push({{severity:"warning",message:`공정 순서 확인: ${{child.processType}} → ${{parent.processType}} (${{rel.childErpCode}} → ${{rel.parentErpCode}})`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}}); if(!rel.confirmed) issues.push({{severity:"warning",message:`미확정: ${{rel.parentErpCode}} ← ${{rel.childErpCode}}`,parentErpCode:rel.parentErpCode,childErpCode:rel.childErpCode,id:rel.id}})}} for(const [key,count] of dup.entries()) if(count>1){{const [p,c]=key.split("=>"); issues.push({{severity:"error",message:`중복 관계: ${{key}} (${{count}}건)`,parentErpCode:p,childErpCode:c}})}} for(const [child,parents] of childParents.entries()) if(parents.size>1) issues.push({{severity:"warning",message:`같은 하위가 여러 상위에 사용됨: ${{child}} (${{parents.size}}곳)`,parentErpCode:[...parents][0],childErpCode:child}}); for(const cycle of findCycles()) issues.push({{severity:"error",message:`순환 BOM: ${{cycle.join(" → ")}}`,parentErpCode:cycle[0],childErpCode:cycle[1]||cycle[0]}}); if(state.mode==="review"){{for(const parent of parentItems) if(!state.relations.some(r=>r.parentErpCode===parent.erpCode)) issues.push({{severity:"warning",message:`상위 품목에 하위 없음: ${{parent.erpCode}} ${{parent.itemName}}`,parentErpCode:parent.erpCode,childErpCode:""}})}} return issues}}
    function renderValidation(){{const issues=buildIssues(); const errors=issues.filter(i=>i.severity==="error"), warnings=issues.filter(i=>i.severity==="warning"); el.validationSummary.className=`pill ${{errors.length?"error":warnings.length?"warn":"ok"}}`; el.validationSummary.textContent=errors.length?`오류 ${{errors.length}}건 · 경고 ${{warnings.length}}건`:warnings.length?`경고 ${{warnings.length}}건`:"정상"; el.warnings.innerHTML=issues.length?issues.slice(0,120).map(i=>`<button class="issue ${{i.severity==="error"?"error":""}}" data-parent="${{esc(i.parentErpCode||"")}}">${{i.severity==="error"?"오류":"경고"}} · ${{esc(i.message)}}</button>`).join(""):`<div class="issue ok">현재 경고 없음</div>`; return issues}}
    function renderStats(){{const issues=buildIssues(), errors=issues.filter(i=>i.severity==="error").length, warnings=issues.length-errors; const saved=state.lastSavedAt?new Date(state.lastSavedAt).toLocaleTimeString("ko-KR",{{hour:"2-digit",minute:"2-digit",second:"2-digit"}}):"-"; const complete=parentItems.filter(p=>state.relations.some(r=>r.parentErpCode===p.erpCode)).length; const progress=Math.round((complete/parentItems.length)*100); el.stats.innerHTML=`<span class="pill info">작업자 ${{esc(state.workerName||"-")}}</span><span class="pill ok">자동 저장 ${{esc(saved)}}</span><span class="pill">관계 ${{state.relations.length}}건</span><span class="pill">진행 ${{progress}}%</span><span class="pill ${{errors?"error":warnings?"warn":"ok"}}">오류 ${{errors}} · 경고 ${{warnings}}</span>`}}
    function renderAll(){{document.body.classList.toggle("review",state.mode==="review"); el.workerName.value=state.workerName; el.allowedOnly.checked=state.allowedOnly; el.draftModeBtn.classList.toggle("active",state.mode==="draft"); el.reviewModeBtn.classList.toggle("active",state.mode==="review"); renderProcessChips(); renderParentList(); renderSelectedParent(); renderChildList(); renderBomRows(); renderValidation(); renderStats()}}
    function openAddModal(childCode){{const parent=itemByCode.get(state.selectedParent), child=itemByCode.get(childCode); if(!parent||!child){{alert("ERP 코드를 확인하세요.");return}} state.modalChild=childCode; el.modalParentSummary.innerHTML=itemCard(parent).replace(/^<button/,"<div").replace(/<\\/button>$/,"</div>"); el.modalChildSummary.innerHTML=itemCard(child).replace(/^<button/,"<div").replace(/<\\/button>$/,"</div>"); el.modalQty.value="1"; el.modalUnit.value="EA"; el.modalConfirmed.checked=false; el.modalNotes.value=""; el.addModal.classList.add("open"); setTimeout(()=>el.modalQty.focus(),0)}}
    function closeAddModal(){{state.modalChild=null; el.addModal.classList.remove("open")}}
    function addModalRelation(){{if(!state.modalChild)return; if(state.relations.some(r=>r.parentErpCode===state.selectedParent&&r.childErpCode===state.modalChild)){{alert("이미 추가된 하위 품목입니다.");return}} state.relations.push(relation(state.selectedParent,state.modalChild,{{quantity:Number(el.modalQty.value||0),unit:el.modalUnit.value.trim()||"EA",confirmed:el.modalConfirmed.checked,notes:el.modalNotes.value.trim()}})); closeAddModal(); saveDraft(); renderAll()}}
    function updateRelation(id,field,value){{const rel=state.relations.find(row=>row.id===id); if(!rel)return; if(field==="quantity")rel.quantity=Number(value||0); if(field==="unit")rel.unit=String(value||"EA").trim()||"EA"; if(field==="confirmed")rel.confirmed=Boolean(value); if(field==="notes")rel.notes=String(value||""); saveDraft(); renderValidation(); renderStats()}}
    function deleteRelation(id){{setUndo("삭제"); state.relations=state.relations.filter(r=>r.id!==id); saveDraft(); renderAll()}}
    function csvEscape(v){{const t=String(v??""); return /[",\\r\\n]/.test(t)?`"${{t.replace(/"/g,'""')}}"`:t}}
    function relationCsv(rows){{const header=["parent_erp_code","parent_item_name","parent_process_type","child_erp_code","child_item_name","child_process_type","quantity","unit","confirmed","notes"]; const lines=[header.join(",")]; for(const rel of rows){{const p=itemByCode.get(rel.parentErpCode), c=itemByCode.get(rel.childErpCode); lines.push([rel.parentErpCode,p?.itemName||"",p?.processType||"",rel.childErpCode,c?.itemName||"",c?.processType||"",rel.quantity,rel.unit,rel.confirmed?"TRUE":"FALSE",rel.notes].map(csvEscape).join(","))}} return "\\ufeff"+lines.join("\\r\\n")}}
    function download(name,text,type="text/plain;charset=utf-8"){{const blob=new Blob([text],{{type}}), url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)}}
    function stamp(){{return new Date().toISOString().slice(0,19).replace(/[T:]/g,"-")}}
    function exportCsv(final=false){{const issues=buildIssues(), errors=issues.filter(i=>i.severity==="error"); if(final&&errors.length){{alert(`오류 ${{errors.length}}건이 있어 확정 CSV를 만들 수 없습니다.`);return}} if(final&&issues.length-errors.length&&!confirm("경고가 남아 있습니다. 검수 사유를 확인했고 확정 CSV를 내보내겠습니까?"))return; download(`${{final?"bom_final":"bom_draft"}}_${{stamp()}}.csv`,relationCsv(state.relations),"text/csv;charset=utf-8")}}
    function exportReviewCsv(){{const issues=buildIssues(); const lines=[["status","severity","message","parent_erp_code","child_erp_code","notes"].join(",")]; for(const i of issues){{const rel=state.relations.find(r=>r.id===i.id); lines.push(["OPEN",i.severity,i.message,i.parentErpCode||"",i.childErpCode||"",rel?.notes||""].map(csvEscape).join(","))}} download(`bom_review_${{stamp()}}.csv`,"\\ufeff"+lines.join("\\r\\n"),"text/csv;charset=utf-8")}}
    function saveJson(){{const issues=buildIssues(); const payload={{tool:"BOM Planner",version:"1.0",catalog:CATALOG,createdAt:new Date().toISOString(),workerName:state.workerName,selectedParent:state.selectedParent,relations:state.relations,validationSummary:{{errors:issues.filter(i=>i.severity==="error").length,warnings:issues.filter(i=>i.severity==="warning").length}}}}; download(`bom_draft_${{state.workerName||"worker"}}_${{stamp()}}.json`,JSON.stringify(payload,null,2),"application/json;charset=utf-8")}}
    function parseCsv(text){{const rows=[]; let row=[], cell="", quoted=false; for(let i=0;i<text.length;i++){{const c=text[i],n=text[i+1]; if(quoted){{if(c==='"'&&n==='"'){{cell+='"';i++}}else if(c==='"')quoted=false;else cell+=c}}else if(c==='"')quoted=true;else if(c===","){{row.push(cell);cell=""}}else if(c==="\\n"){{row.push(cell);rows.push(row);row=[];cell=""}}else if(c!=="\\r")cell+=c}} row.push(cell); if(row.some(v=>v!==""))rows.push(row); return rows}}
    function importRelationsFromCsv(text){{const rows=parseCsv(text.replace(/^\\ufeff/,"")); const h=rows[0]?.map(x=>x.trim())||[]; const pi=h.indexOf("parent_erp_code"), ci=h.indexOf("child_erp_code"), qi=h.indexOf("quantity"), ui=h.indexOf("unit"), fi=h.indexOf("confirmed"), ni=h.indexOf("notes"); if(pi<0||ci<0)throw new Error("CSV 컬럼을 확인하세요."); return rows.slice(1).map(row=>relation((row[pi]||"").trim(),(row[ci]||"").trim(),{{quantity:Number(row[qi]||1),unit:row[ui]||"EA",confirmed:["TRUE","1","확정"].includes(String(row[fi]||"").toUpperCase()),notes:row[ni]||""}})).filter(r=>itemByCode.has(r.parentErpCode)&&itemByCode.has(r.childErpCode))}}
    function loadTextFile(file, cb){{const reader=new FileReader(); reader.onload=()=>cb(String(reader.result||"")); reader.readAsText(file,"utf-8")}}
    function importJson(text){{const data=JSON.parse(text.replace(/^\\ufeff/,"")); if(!Array.isArray(data.relations))throw new Error("작업파일 형식이 아닙니다."); if(data.catalog?.checksum&&data.catalog.checksum!==CATALOG.checksum&&!confirm("품목 원장 버전이 다릅니다. 그래도 불러올까요?"))return; setUndo("작업파일 불러오기"); state.workerName=data.workerName||state.workerName; state.selectedParent=data.selectedParent&&itemByCode.has(data.selectedParent)?data.selectedParent:state.selectedParent; state.relations=data.relations.filter(r=>itemByCode.has(r.parentErpCode)&&itemByCode.has(r.childErpCode)); saveDraft(); renderAll()}}
    el.workerName.addEventListener("input",e=>{{state.workerName=e.target.value; saveDraft()}});
    el.processChips.addEventListener("click",e=>{{const b=e.target.closest("button[data-process]"); if(!b)return; state.processFilter=b.dataset.process; renderAll()}});
    el.allowedOnly.addEventListener("change",e=>{{state.allowedOnly=e.target.checked; saveDraft(); renderChildList()}});
    el.draftModeBtn.addEventListener("click",()=>{{state.mode="draft"; renderAll()}}); el.reviewModeBtn.addEventListener("click",()=>{{state.mode="review"; renderAll()}});
    el.parentSearch.addEventListener("input",e=>{{state.parentSearch=e.target.value; renderParentList()}}); el.childSearch.addEventListener("input",e=>{{state.childSearch=e.target.value; renderChildList()}});
    el.parentList.addEventListener("click",e=>{{const card=e.target.closest(".item-card[data-code]"); if(!card)return; state.selectedParent=card.dataset.code; saveDraft(); renderAll()}});
    el.selectedParent.addEventListener("click",e=>{{const b=e.target.closest("button[data-view]"); if(!b)return; state.viewMode=b.dataset.view; renderAll()}});
    el.childList.addEventListener("click",e=>{{const add=e.target.closest(".add-child"); if(!add)return; const wrap=add.closest(".candidate-wrap"); if(wrap?.dataset.code)openAddModal(wrap.dataset.code)}});
    el.childList.addEventListener("dblclick",e=>{{const wrap=e.target.closest(".candidate-wrap"); if(wrap?.dataset.code)openAddModal(wrap.dataset.code)}});
    el.childList.addEventListener("dragstart",e=>{{const card=e.target.closest(".item-card[data-code]"); if(!card)return; e.dataTransfer.setData("text/plain",card.dataset.code); e.dataTransfer.effectAllowed="copy"}});
    el.bomDropzone.addEventListener("dragover",e=>{{e.preventDefault(); el.bomDropzone.classList.add("dragover")}}); el.bomDropzone.addEventListener("dragleave",()=>el.bomDropzone.classList.remove("dragover")); el.bomDropzone.addEventListener("drop",e=>{{e.preventDefault(); el.bomDropzone.classList.remove("dragover"); const code=e.dataTransfer.getData("text/plain"); if(code&&itemByCode.has(code))openAddModal(code)}});
    el.bomDropzone.addEventListener("change",e=>{{const row=e.target.closest(".bom-row[data-id]"); if(!row)return; const field=e.target.dataset.field; if(!field)return; updateRelation(row.dataset.id,field,e.target.type==="checkbox"?e.target.checked:e.target.value); if(field!=="notes")renderBomRows()}});
    el.bomDropzone.addEventListener("click",e=>{{const button=e.target.closest(".delete-relation"); if(!button)return; const row=button.closest(".bom-row[data-id]"); if(row&&confirm("이 BOM 관계를 삭제합니다."))deleteRelation(row.dataset.id)}});
    el.warnings.addEventListener("click",e=>{{const issue=e.target.closest(".issue[data-parent]"); if(!issue||!issue.dataset.parent)return; state.selectedParent=issue.dataset.parent; saveDraft(); renderAll()}});
    el.directAddBtn.addEventListener("click",()=>{{const code=el.directCode.value.trim(); if(!itemByCode.has(code)){{alert("ERP 코드를 찾을 수 없습니다.");return}} openAddModal(code)}}); el.directCode.addEventListener("keydown",e=>{{if(e.key==="Enter")el.directAddBtn.click()}});
    el.modalCancel.addEventListener("click",closeAddModal); el.modalAdd.addEventListener("click",addModalRelation); el.addModal.addEventListener("click",e=>{{if(e.target===el.addModal)closeAddModal()}}); window.addEventListener("keydown",e=>{{if(e.key==="Escape"&&el.addModal.classList.contains("open"))closeAddModal()}});
    el.saveJsonBtn.addEventListener("click",saveJson); el.loadJsonBtn.addEventListener("click",()=>el.jsonFileInput.click()); el.jsonFileInput.addEventListener("change",e=>{{const file=e.target.files?.[0]; if(file)loadTextFile(file,t=>{{try{{importJson(t)}}catch(err){{alert(err.message)}}}}); e.target.value=""}});
    el.exportCsvBtn.addEventListener("click",()=>exportCsv(false)); el.exportFinalCsvBtn.addEventListener("click",()=>exportCsv(true)); el.exportReviewCsvBtn.addEventListener("click",exportReviewCsv);
    el.csvFileInput.addEventListener("change",e=>{{const file=e.target.files?.[0]; if(file)loadTextFile(file,t=>{{try{{const imported=importRelationsFromCsv(t); if(!imported.length)throw new Error("가져올 관계가 없습니다."); if(confirm(`현재 작업을 CSV ${{imported.length}}건으로 교체합니다.`)){{setUndo("CSV 불러오기"); state.relations=imported; state.selectedParent=imported[0].parentErpCode; saveDraft(); renderAll()}}}}catch(err){{alert(err.message)}}}}); e.target.value=""}});
    el.resetBtn.addEventListener("click",()=>{{if(!confirm("브라우저에 임시 저장된 BOM 작업을 초기화합니다."))return; setUndo("초기화"); state.relations=[]; storage.removeItem(STORAGE_KEY); state.lastSavedAt=null; renderAll()}});
    el.undoBtn.addEventListener("click",()=>{{if(!state.undo)return; state.workerName=state.undo.draft.workerName; state.selectedParent=state.undo.draft.selectedParent; state.relations=state.undo.draft.relations; state.undo=null; el.undoBtn.disabled=true; el.undoBtn.textContent="되돌리기"; saveDraft(); renderAll()}});
    loadDraft(); renderAll();
  </script>
</body>
</html>"""


def guide_html(generated_at: str, checksum: str) -> str:
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BOM 작업 사용안내</title>
<style>body{{font:15px "Malgun Gothic","Segoe UI",Arial,sans-serif;line-height:1.65;margin:0;background:#f6f7f8;color:#1f252c}}main{{max-width:920px;margin:0 auto;padding:28px}}section{{background:#fff;border:1px solid #d9dee5;border-radius:8px;padding:18px;margin:14px 0}}h1{{margin-top:0}}code{{background:#eef3f5;padding:2px 5px;border-radius:4px}}li{{margin:6px 0}}</style></head>
<body><main>
<h1>BOM 구성 작업 사용안내</h1>
<p>이 도구는 기존 ERP/DB에 직접 저장하지 않고, 담당자가 BOM 초안을 만든 뒤 검수자가 확인해 CSV로 제출하기 위한 독립 HTML입니다.</p>
<section><h2>1. 시작</h2><ol><li><code>bom_planner.html</code>을 더블클릭합니다.</li><li>상단의 작업자명에 이름을 입력합니다.</li><li>왼쪽에서 상위 품목을 고릅니다.</li><li>오른쪽 하위 후보에서 <code>＋</code>, 더블클릭, 드래그 앤 드롭, ERP 코드 직접 입력 중 하나로 하위 품목을 추가합니다.</li></ol></section>
<section><h2>2. 저장</h2><ul><li>작업은 브라우저에 자동 저장됩니다.</li><li>다른 PC로 옮기려면 반드시 <code>작업파일 저장</code>으로 JSON 파일을 내보내세요.</li><li>작업을 이어갈 때는 <code>작업파일 불러오기</code>를 사용합니다.</li></ul></section>
<section><h2>3. 검수</h2><ul><li><code>검수자</code> 모드로 바꾸면 미완료 상위 품목까지 경고로 표시됩니다.</li><li>오류는 확정 CSV 생성을 막습니다.</li><li>경고만 남은 경우에는 검수자가 사유를 비고에 적고 확정 CSV를 만들 수 있습니다.</li></ul></section>
<section><h2>4. 제출</h2><ul><li><code>확정 CSV</code>: 최종 BOM 원장 반영용입니다.</li><li><code>검수 CSV</code>: 오류/경고 목록 전달용입니다.</li><li>CSV는 Excel에서 한글이 깨지지 않도록 UTF-8 BOM 형식으로 저장됩니다.</li></ul></section>
<section><h2>원장 정보</h2><p>생성시각: {generated_at}<br>원장 checksum: {checksum}</p></section>
</main></body></html>"""


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items, source = load_items()
    checksum = checksum_items(items)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    HTML_PATH.write_text(app_html(items, source, checksum, generated_at), encoding="utf-8")
    GUIDE_PATH.write_text(guide_html(generated_at, checksum), encoding="utf-8")

    sample_relations = choose_sample_relations(items)
    issues_summary = {"errors": 0, "warnings": 1}
    SAMPLE_JSON_PATH.write_text(
        json.dumps(
            {
                "tool": "BOM Planner",
                "version": "1.0",
                "catalog": {
                    "sourceFile": source.name,
                    "itemCount": len(items),
                    "generatedAt": generated_at,
                    "checksum": checksum,
                },
                "createdAt": datetime.now().isoformat(timespec="seconds"),
                "workerName": "sample",
                "selectedParent": sample_relations[0]["parentErpCode"] if sample_relations else "",
                "relations": sample_relations,
                "validationSummary": issues_summary,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    SAMPLE_CSV_PATH.write_text(csv_text(sample_relations, items), encoding="utf-8")
    print(f"wrote {HTML_PATH}")
    print(f"wrote {GUIDE_PATH}")
    print(f"wrote {SAMPLE_JSON_PATH}")
    print(f"wrote {SAMPLE_CSV_PATH}")
    print(f"items={len(items)} checksum={checksum}")


if __name__ == "__main__":
    main()
