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
    return "﻿" + output.getvalue()


APP_TEMPLATE = r"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BOM 작업</title>
  <style>
    :root {
      --primary:#167c80; --primary-d:#0d5e62; --primary-soft:#e1f3f2;
      --bg:#f5f7fa; --surface:#ffffff; --border:#e4e8ec; --border-strong:#c8cdd4;
      --text:#1f252c; --muted:#687380; --muted-2:#94a3b8;
      --ok:#16a34a; --ok-bg:#ecfdf5; --ok-border:#86efac;
      --warn:#b45309; --warn-bg:#fef3c7; --warn-border:#fcd34d;
      --danger:#dc2626; --danger-bg:#fef2f2; --danger-border:#fca5a5;
      --shadow-sm:0 1px 2px rgba(20,31,43,.05);
      --shadow-md:0 4px 16px rgba(20,31,43,.06);
      --shadow-lg:0 12px 40px rgba(20,31,43,.10);
      --dept-T:#4a80d6; --dept-T-bg:#e6efff;
      --dept-H:#8b5cf6; --dept-H-bg:#f3e8ff;
      --dept-V:#0891b2; --dept-V-bg:#cffafe;
      --dept-N:#f59e0b; --dept-N-bg:#fef3c7;
      --dept-A:#16a34a; --dept-A-bg:#dcfce7;
      --dept-P:#475569; --dept-P-bg:#e2e8f0;
    }
    *{box-sizing:border-box}
    html,body{height:100%;margin:0;overflow:hidden}
    body{background:var(--bg);color:var(--text);font:16px/1.5 "Malgun Gothic","Apple SD Gothic Neo","Segoe UI",Arial,sans-serif;-webkit-text-size-adjust:100%}
    button,input,textarea,select{font:inherit;color:inherit}
    button{cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:12px;padding:10px 16px;min-height:44px;white-space:nowrap;transition:border-color .15s,background .15s,box-shadow .15s,transform .12s}
    button:hover{border-color:var(--primary);color:var(--primary-d)}
    button:disabled{opacity:.45;cursor:not-allowed}
    button:disabled:hover{border-color:var(--border);color:var(--text);transform:none}
    button.primary{background:var(--primary);border-color:var(--primary);color:#fff}
    button.primary:hover{background:var(--primary-d);border-color:var(--primary-d);color:#fff}
    button.ghost{background:transparent;border-color:transparent;color:var(--muted)}
    button.ghost:hover{background:var(--bg);color:var(--text)}
    button.danger{border-color:var(--danger-border);color:var(--danger)}
    button.danger:hover{background:var(--danger-bg);border-color:var(--danger);color:var(--danger)}
    button.cta{min-height:56px;font-size:17px;font-weight:600;border-radius:14px;padding:14px 24px}
    button.icon-btn{min-height:36px;width:36px;height:36px;padding:0;display:inline-grid;place-items:center;border-radius:10px}
    button.small{min-height:36px;padding:6px 12px;font-size:13px;border-radius:10px}
    input[type="text"],input[type="search"],input[type="number"],textarea{
      width:100%;border:1px solid var(--border);border-radius:12px;background:var(--surface);
      padding:12px 14px;outline:none;transition:border-color .15s,box-shadow .15s}
    input[type="number"]{appearance:textfield}
    input[type="number"]::-webkit-outer-spin-button,input[type="number"]::-webkit-inner-spin-button{appearance:none;margin:0}
    input:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 4px rgba(22,124,128,.12)}
    input.big{font-size:18px;padding:16px 18px;border-radius:14px}
    textarea{min-height:80px;resize:vertical;font-family:inherit}

    .app{height:100%;display:flex;flex-direction:column;overflow:hidden}
    .view{display:none;flex:1;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
    .app[data-view="main"] .view-main{display:flex}
    .app[data-view="parent"] .view-parent{display:flex}
    .app[data-view="edit"] .view-edit{display:flex}
    .app[data-view="review"] .view-review{display:flex}

    .view-header{padding:18px 24px;display:flex;align-items:center;gap:16px;background:var(--surface);border-bottom:1px solid var(--border)}
    .view-header > .titleblock{flex:1;min-width:0}
    .view-title{font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-.3px}
    .view-sub{color:var(--muted);font-size:14px;margin-top:2px}
    .back-link{background:transparent;border:0;color:var(--muted);font-size:14px;padding:8px 12px;min-height:auto;border-radius:10px}
    .back-link:hover{background:var(--bg);color:var(--text)}
    .view-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:20px 24px;gap:16px;overflow:auto}
    .view-footer{padding:14px 24px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;gap:12px}
    .view-footer .spacer{flex:1}
    .saved-pill{font-size:12px;color:var(--muted-2)}

    .main-header{padding:18px 24px 0;background:var(--surface);border-bottom:1px solid var(--border)}
    .main-header .topline{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}
    .main-header h1{font-size:24px;margin:0;letter-spacing:-.4px;display:flex;align-items:center;gap:10px}
    .main-header h1 .logo{font-size:28px;line-height:1}
    .main-header .meta-line{font-size:12px;color:var(--muted-2)}
    .tabs{display:flex;gap:4px;margin:0 -4px}
    .tab{background:transparent;border:0;border-bottom:3px solid transparent;border-radius:10px 10px 0 0;padding:12px 18px;min-height:auto;font-size:15px;font-weight:500;color:var(--muted);transition:color .15s,border-color .15s,background .15s}
    .tab:hover{color:var(--text);background:var(--bg);border-color:transparent}
    .tab.active{color:var(--primary-d);border-bottom-color:var(--primary);font-weight:600}
    .tab .badge{display:inline-grid;place-items:center;background:var(--bg);color:var(--muted);border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600;margin-left:6px;min-width:22px}
    .tab.active .badge{background:var(--primary-soft);color:var(--primary-d)}
    .tab-content{flex:1;min-height:0;display:flex;flex-direction:column;padding:20px 24px;gap:16px;overflow:auto}
    .panel-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .panel-header h2{margin:0;font-size:18px;font-weight:700}
    .panel-header .panel-sub{font-size:13px;color:var(--muted)}

    .dept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .dept-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px 24px 20px 30px;cursor:pointer;text-align:left;display:grid;gap:4px;transition:border-color .15s,box-shadow .15s,transform .15s;box-shadow:var(--shadow-sm);position:relative;overflow:hidden;min-height:auto}
    .dept-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:var(--strip,var(--border))}
    .dept-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);transform:translateY(-2px)}
    .dept-card .emoji{font-size:34px;line-height:1;margin-bottom:4px}
    .dept-card .name{font-size:22px;font-weight:700;color:var(--text);letter-spacing:-.2px}
    .dept-card .stages{font-size:13px;color:var(--muted-2);font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.5px}
    .dept-card .count{font-size:14px;color:var(--muted);margin-top:6px}

    .item-card{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px 14px 22px;display:grid;grid-template-columns:1fr auto;gap:12px;cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s,transform .12s;box-shadow:var(--shadow-sm);min-height:auto;position:relative;overflow:hidden}
    .item-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--strip,transparent)}
    .item-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);transform:translateY(-1px)}
    .item-card.active{border-color:var(--primary);background:var(--primary-soft)}
    .item-card .body{min-width:0}
    .item-card .name{font-size:17px;font-weight:600;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}
    .item-card .meta{margin-top:4px;font-size:13px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .item-card .meta .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;color:#475569}
    .item-card .status{align-self:center;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:500;white-space:nowrap}
    .status-empty{background:var(--bg);color:var(--muted);border:1px solid var(--border)}
    .status-doing{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-border)}
    .status-done{background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-border)}
    .status-error{background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border)}

    .switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;color:var(--muted);font-size:14px}
    .switch input{appearance:none;width:38px;height:22px;background:var(--border-strong);border-radius:999px;position:relative;cursor:pointer;transition:background .15s;margin:0;padding:0;border:0}
    .switch input:checked{background:var(--primary)}
    .switch input::after{content:"";position:absolute;left:2px;top:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .switch input:checked::after{transform:translateX(16px)}
    .switch input:focus{box-shadow:0 0 0 3px rgba(22,124,128,.18)}

    .item-list{display:grid;gap:10px}
    .filter-stack{display:grid;gap:8px}
    .filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .filter-row.tight{gap:6px}
    .filter-label{font-size:12px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.06em}
    .chip{min-height:34px;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;background:var(--surface);color:var(--muted);border:1px solid var(--border)}
    .chip:hover{background:var(--bg);transform:none}
    .chip.active{background:var(--primary);border-color:var(--primary);color:#fff}
    .chip.warn.active{background:var(--warn);border-color:var(--warn)}
    .chip.good.active{background:var(--ok);border-color:var(--ok)}
    .tool-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .tool-row .small{font-weight:600}
    .mini-stat{font-size:12px;color:var(--muted);background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:5px 10px}

    .edit-top{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px 22px 18px 28px;display:grid;gap:6px;box-shadow:var(--shadow-sm);position:relative;overflow:hidden}
    .edit-top::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:var(--strip,var(--primary))}
    .edit-top .label{font-size:13px;color:var(--muted);font-weight:500}
    .edit-top .name{font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-.2px}
    .edit-top .meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:14px;align-items:center;margin-top:4px}
    .edit-top .meta .code{font-family:ui-monospace,Menlo,Consolas,monospace;color:#475569;font-weight:600}
    .progress-pill{background:var(--primary-soft);color:var(--primary-d);padding:5px 12px;border-radius:999px;font-weight:600;font-size:13px}

    .edit-cols{display:flex;gap:16px;flex:1;min-height:0;min-width:0}
    .edit-col{flex:1;min-width:0;min-height:0;background:var(--surface);border:1px solid var(--border);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-sm)}
    .col-head{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fafbfc;flex-wrap:wrap}
    .col-head h3{margin:0;font-size:16px;font-weight:600}
    .col-head .count{font-size:13px;color:var(--muted)}
    .col-search{padding:12px 14px;background:#fafbfc;border-bottom:1px solid var(--border);display:grid;gap:8px}
    .col-body{flex:1;min-height:0;overflow:auto;padding:14px 14px 18px;display:flex;flex-direction:column;gap:10px}

    .bom-row{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:14px 16px 14px 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;transition:border-color .15s;position:relative;overflow:hidden}
    .bom-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--strip,transparent)}
    .bom-row.warn{border-color:var(--warn-border);background:#fffbeb}
    .bom-row.error{border-color:var(--danger-border);background:#fef2f2}
    .bom-row > .body{flex:1 1 240px;min-width:0}
    .bom-row > .qty-stepper, .bom-row > .row-actions{flex:0 0 auto}
    .bom-row .name{font-size:16px;font-weight:600;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}
    .bom-row .sub{font-size:13px;color:var(--muted);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .bom-row .sub .code{font-family:ui-monospace,Menlo,Consolas,monospace;color:#475569;font-weight:600}
    .qty-stepper{display:inline-flex;align-items:center;border:1px solid var(--border-strong);border-radius:12px;overflow:hidden;background:var(--surface)}
    .qty-stepper button{min-height:auto;width:38px;height:42px;padding:0;border:0;border-radius:0;background:transparent;font-size:20px;font-weight:600;color:var(--muted)}
    .qty-stepper button:hover{background:var(--bg);color:var(--primary);transform:none}
    .qty-stepper input{width:52px;border:0;text-align:center;padding:8px 0;border-radius:0;font-size:15px;font-weight:600;background:transparent}
    .qty-stepper input:focus{box-shadow:none;outline:0;background:var(--primary-soft)}
    .row-actions{display:flex;gap:6px}
    .bom-issue{flex:1 1 100%;margin-top:0;padding:10px 14px;background:rgba(0,0,0,.03);border-radius:10px;font-size:13px;color:var(--warn);display:flex;gap:8px;align-items:flex-start;line-height:1.5}
    .bom-row.error .bom-issue{color:var(--danger);background:rgba(220,38,38,.06)}
    .bom-notes{flex:1 1 100%;margin-top:0;display:none}
    .bom-row.expanded .bom-notes{display:block}
    .bom-notes textarea{min-height:60px;font-size:14px;padding:10px 12px;border-radius:10px}

    .empty-state{padding:40px 20px;text-align:center;color:var(--muted);font-size:15px;line-height:1.7}
    .empty-state .arrow{font-size:32px;margin:8px 0;color:var(--muted-2)}
    .empty-state strong{color:var(--text);font-weight:600}

    .candidate{cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px 14px 22px;display:flex;align-items:center;gap:14px;text-align:left;transition:border-color .15s,background .15s,box-shadow .15s,transform .12s;position:relative;min-height:auto;width:100%;box-shadow:var(--shadow-sm)}
    .candidate::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--strip,transparent);border-radius:12px 0 0 12px}
    .candidate:hover:not(:disabled){border-color:var(--primary);background:#f5fbfb;box-shadow:var(--shadow-md)}
    .candidate:disabled{opacity:.45;cursor:not-allowed;background:#f6f7f9}
    .candidate > .body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
    .candidate .name{font-size:15px;font-weight:600;line-height:1.35;color:var(--text);overflow-wrap:anywhere;word-break:break-word}
    .candidate .sub{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .candidate .sub .code{font-family:ui-monospace,Menlo,Consolas,monospace;color:#475569;font-weight:600;background:#f1f5f9;padding:2px 7px;border-radius:6px;font-size:12px}
    .candidate .add-icon{flex:0 0 auto;width:36px;height:36px;border-radius:50%;background:var(--primary-soft);color:var(--primary-d);display:grid;place-items:center;font-size:20px;font-weight:700;line-height:1;transition:background .15s,color .15s,transform .12s}
    .candidate:hover:not(:disabled) .add-icon{background:var(--primary);color:#fff;transform:scale(1.05)}
    .candidate.added .add-icon{background:var(--ok-bg);color:var(--ok)}
    .candidate.warn{border-color:var(--warn-border);background:#fffbeb}
    .candidate.best{border-color:var(--ok-border)}
    .tag{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;border:1px solid var(--border);background:var(--bg);color:var(--muted)}
    .tag.best{background:var(--ok-bg);border-color:var(--ok-border);color:var(--ok)}
    .tag.ok{background:var(--primary-soft);border-color:#b5e3e0;color:var(--primary-d)}
    .tag.warn{background:var(--warn-bg);border-color:var(--warn-border);color:var(--warn)}
    .tag.added{background:var(--bg);border-color:var(--border);color:var(--muted)}

    .review-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .summary-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px;display:grid;gap:6px;box-shadow:var(--shadow-sm)}
    .summary-card.ok{border-color:var(--ok-border);background:var(--ok-bg)}
    .summary-card.warn{border-color:var(--warn-border);background:var(--warn-bg)}
    .summary-card.error{border-color:var(--danger-border);background:var(--danger-bg)}
    .summary-card .head{font-size:14px;font-weight:600;color:var(--muted)}
    .summary-card.ok .head{color:var(--ok)}
    .summary-card.warn .head{color:var(--warn)}
    .summary-card.error .head{color:var(--danger)}
    .summary-card .big{font-size:28px;font-weight:700;line-height:1.1;letter-spacing:-.5px}
    .summary-card .desc{font-size:14px;line-height:1.5;color:var(--text)}

    .review-list{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:8px;display:grid;gap:2px;box-shadow:var(--shadow-sm)}
    .review-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;padding:12px 14px;align-items:center;border-radius:12px}
    .review-item:hover{background:#fafbfc}
    .review-item .icon{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;font-size:16px}
    .review-item.ok .icon{background:var(--ok)}
    .review-item.warn .icon{background:var(--warn)}
    .review-item.error .icon{background:var(--danger)}
    .review-item .name{font-size:15px;font-weight:600;line-height:1.3}
    .review-item .sub{font-size:13px;color:var(--muted);margin-top:2px}
    .review-item .sub .code{font-family:ui-monospace,Menlo,Consolas,monospace;color:#475569}
    .review-item .qty-text{font-size:14px;color:var(--text);font-weight:500;background:var(--bg);padding:4px 10px;border-radius:8px}

    .issue-list{display:grid;gap:8px}
    .issue-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;text-align:left;display:flex;gap:12px;align-items:flex-start;box-shadow:var(--shadow-sm)}
    .issue-card.error{border-color:var(--danger-border);background:var(--danger-bg)}
    .issue-card.warn{border-color:var(--warn-border);background:var(--warn-bg)}
    .issue-card .icon{font-size:20px;line-height:1;margin-top:1px}
    .issue-card .body{flex:1}
    .issue-card .title{font-weight:600;font-size:14px;color:var(--text)}
    .issue-card .desc{font-size:13px;color:var(--muted);margin-top:2px;line-height:1.55}
    .issue-card.error .title{color:var(--danger)}
    .issue-card.warn .title{color:var(--warn)}
    .issue-card.error .desc,.issue-card.warn .desc{color:#5b3a08}
    .issue-card.error .desc{color:#7c1d1d}

    .toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:#1f252c;color:#fff;padding:14px 24px;border-radius:14px;box-shadow:var(--shadow-lg);font-size:15px;font-weight:500;z-index:200;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;max-width:90vw}
    .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .toast.ok{background:var(--ok)}
    .toast.warn{background:var(--warn)}
    .toast.error{background:var(--danger)}

    .footer-pill{font-size:14px;color:var(--muted);display:flex;align-items:center;gap:6px;font-weight:500}
    .footer-pill.ok{color:var(--ok)}
    .footer-pill.warn{color:var(--warn)}
    .footer-pill.error{color:var(--danger)}

    .hidden-file{display:none}

    .menu-btn{position:relative}
    .menu-btn .menu{display:none;position:absolute;right:0;top:calc(100% + 6px);background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);padding:6px;min-width:240px;z-index:50}
    .menu-btn.open .menu{display:block}
    .menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px 14px;border-radius:10px;min-height:auto;font-size:14px;color:var(--text)}
    .menu button:hover{background:var(--bg);transform:none}
    .menu button.danger-item{color:var(--danger)}

    .footnote{color:var(--muted-2);font-size:12px;text-align:center;padding:12px}

    @media (max-width:780px){
      .edit-cols{flex-direction:column}
      .edit-col{min-height:300px;flex:none}
      .view-body{padding:16px;gap:12px}
      .view-header{padding:14px 16px;gap:10px}
      .view-footer{padding:12px 16px;flex-wrap:wrap}
      .view-footer button.cta{width:100%;order:99}
      .start-card{padding:32px 24px}
      .start-card h1{font-size:26px}
      .review-summary{grid-template-columns:1fr}
      .view-title{font-size:18px}
      .item-card{grid-template-columns:1fr}
      .item-card .status{justify-self:start}
      .filter-row{align-items:flex-start}
    }
  </style>
</head>
<body>
  <div class="app" data-view="main">
    <section class="view view-main" id="view-main"></section>
    <section class="view view-parent" id="view-parent"></section>
    <section class="view view-edit" id="view-edit"></section>
    <section class="view view-review" id="view-review"></section>
  </div>
  <div class="toast" id="toast"></div>
  <input type="file" id="jsonFileInput" class="hidden-file" accept=".json,application/json">
  <script>
    const ITEMS = __ITEMS_JSON__;
    const CATALOG = __META_JSON__;
    const PROCESS_ORDER = __PROCESS_JSON__;
    const PROCESS_INDEX = Object.fromEntries(PROCESS_ORDER.map((c,i)=>[c,i]));
    const itemByCode = new Map(ITEMS.map(i=>[i.erpCode,i]));
    const parentItems = ITEMS.filter(i=>!i.processType.endsWith("R"));

    const DEPARTMENTS = [
      {code:"T",name:"튜브",emoji:"🔩",processes:["TR","TA","TF"]},
      {code:"H",name:"고압",emoji:"⚡",processes:["HR","HA","HF"]},
      {code:"V",name:"진공",emoji:"🧲",processes:["VR","VA","VF"]},
      {code:"N",name:"튜닝",emoji:"🎛",processes:["NR","NA","NF"]},
      {code:"A",name:"조립",emoji:"🛠",processes:["AR","AA","AF"]},
      {code:"P",name:"출하",emoji:"🚚",processes:["PR","PA","PF"]}
    ];
    const STAGE_NAMES = {R:"준비 단계", A:"중간 단계", F:"마감 단계"};
    const DEPT_INDEX = Object.fromEntries(DEPARTMENTS.map((d,i)=>[d.code,i]));
    const PARENT_STATUS_FILTERS = [
      {code:"all",label:"전체"},
      {code:"empty",label:"아직 안 함"},
      {code:"working",label:"작업 중"},
      {code:"issue",label:"고칠 곳"},
      {code:"done",label:"끝남"}
    ];
    const PARENT_STAGE_FILTERS = [
      {code:"ALL",label:"전체"},
      {code:"A",label:"중간"},
      {code:"F",label:"마감"}
    ];
    const CHILD_MODES = [
      {code:"recommended",label:"추천"},
      {code:"prevFinal",label:"이전공정 F"},
      {code:"all",label:"전체"}
    ];
    const STAGE_FILTERS = [
      {code:"ALL",label:"전체"},
      {code:"R",label:"준비"},
      {code:"A",label:"중간"},
      {code:"F",label:"마감"}
    ];

    function deptOf(processCode){
      if(!processCode) return null;
      return DEPARTMENTS.find(d => d.code === processCode[0]) || null;
    }
    function stageOf(processCode){
      if(!processCode) return "";
      return STAGE_NAMES[processCode.slice(-1)] || "";
    }
    function stageCode(processCode){
      return processCode ? processCode.slice(-1) : "";
    }
    function deptIndexOf(processCode){
      const d = deptOf(processCode);
      return d ? DEPT_INDEX[d.code] : -1;
    }
    function deptLabel(processCode){
      const d = deptOf(processCode), s = stageOf(processCode);
      if(!d) return processCode || "";
      return d.name + " " + s;
    }
    function stripVar(processCode){
      const d = deptOf(processCode);
      return d ? `var(--dept-${d.code})` : "transparent";
    }

    const STORAGE_KEY = "bom-planner-release-" + CATALOG.checksum;
    const storage = (()=>{
      try{ if(window.localStorage) return window.localStorage; }catch(e){}
      const m=new Map();
      return {getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k)};
    })();

    const state = {
      view: "main",
      activeTab: "work",
      selectedDept: null,
      showAllDepts: false,
      selectedParent: "",
      parentSearch: "",
      parentStatusFilter: "all",
      parentStageFilter: "ALL",
      childSearch: "",
      childMode: "recommended",
      childDeptFilter: "ALL",
      childStageFilter: "ALL",
      hideAdded: true,
      pendingSearch: "",
      relations: [],
      completedParents: [],
      expandedNotesId: null,
      lastDeletedRelation: null,
      lastSavedAt: null
    };

    function esc(v){return String(v??"").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
    function norm(v){return String(v??"").trim().toLowerCase();}
    function relationRule(parent, child){
      if(!parent || !child) return {kind:"warn", label:"확인 필요", score:0, reason:"품목 정보를 확인해야 합니다"};
      const p = PROCESS_INDEX[parent.processType], c = PROCESS_INDEX[child.processType];
      const pd = deptIndexOf(parent.processType), cd = deptIndexOf(child.processType);
      const ps = stageCode(parent.processType), cs = stageCode(child.processType);
      if(p === undefined || c === undefined || pd < 0 || cd < 0){
        return {kind:"warn", label:"확인 필요", score:0, reason:"공정 코드가 원장 규칙과 다릅니다"};
      }
      const previousFinal = cs === "F" && cd === pd - 1 && (ps === "A" || ps === "F");
      if(previousFinal){
        return {kind:"best", label:"이전공정 F", score:120, reason:"이전 공정 완료품이라 다음 공정에 바로 넣기 좋습니다"};
      }
      if(c < p){
        if(cd === pd) return {kind:"ok", label:"같은 공정 이전", score:85, reason:"같은 공정의 앞 단계입니다"};
        return {kind:"ok", label:"이전 공정", score:70, reason:"상위 품목보다 앞 공정입니다"};
      }
      if(c === p) return {kind:"warn", label:"같은 단계", score:20, reason:"상위 품목과 같은 공정 단계입니다"};
      return {kind:"warn", label:"뒤 공정", score:5, reason:"상위 품목보다 뒤 공정이라 확인이 필요합니다"};
    }
    function allowed(parent, child){
      return relationRule(parent, child).kind !== "warn";
    }
    function fmtQty(n){
      const x = Number(n);
      if(!Number.isFinite(x)) return "0";
      return Number.isInteger(x) ? String(x) : String(x);
    }
    function uid(){return Date.now() + "-" + Math.random().toString(36).slice(2,8);}
    function describeCode(code){
      const it = itemByCode.get(code);
      return it ? `${it.itemName} (${code})` : code;
    }
    function safeFilename(s){
      return String(s||"").replace(/[^\w가-힣\-]+/g,"_").slice(0,40) || "x";
    }

    let toastTimer = null;
    function toast(msg, kind){
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.className = "toast show " + (kind || "");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(()=>{ el.classList.remove("show"); }, 1800);
    }

    function loadDraft(){
      try{
        const raw = storage.getItem(STORAGE_KEY);
        if(!raw) return;
        const d = JSON.parse(raw);
        if(d.catalogChecksum && d.catalogChecksum !== CATALOG.checksum) return;
        state.relations = Array.isArray(d.relations)
          ? d.relations.filter(r => itemByCode.has(r.parentErpCode) && itemByCode.has(r.childErpCode))
          : [];
        state.completedParents = Array.isArray(d.completedParents)
          ? d.completedParents.filter(c => itemByCode.has(c))
          : [];
        if(d.selectedParent && itemByCode.has(d.selectedParent)) state.selectedParent = d.selectedParent;
        if(d.selectedDept && DEPARTMENTS.find(x => x.code === d.selectedDept)) state.selectedDept = d.selectedDept;
        if(d.parentStatusFilter && PARENT_STATUS_FILTERS.some(x => x.code === d.parentStatusFilter)) state.parentStatusFilter = d.parentStatusFilter;
        if(d.parentStageFilter && PARENT_STAGE_FILTERS.some(x => x.code === d.parentStageFilter)) state.parentStageFilter = d.parentStageFilter;
        if(d.childMode && CHILD_MODES.some(x => x.code === d.childMode)) state.childMode = d.childMode;
        if(d.childDeptFilter && (d.childDeptFilter === "ALL" || DEPARTMENTS.some(x => x.code === d.childDeptFilter))) state.childDeptFilter = d.childDeptFilter;
        if(d.childStageFilter && STAGE_FILTERS.some(x => x.code === d.childStageFilter)) state.childStageFilter = d.childStageFilter;
        if(typeof d.hideAdded === "boolean") state.hideAdded = d.hideAdded;
        state.lastSavedAt = d.lastSavedAt || null;
      }catch(e){ console.warn(e); }
    }
    function saveDraft(){
      state.lastSavedAt = new Date().toISOString();
      storage.setItem(STORAGE_KEY, JSON.stringify({
        catalogChecksum: CATALOG.checksum,
        catalogSource: CATALOG.sourceFile,
        selectedDept: state.selectedDept,
        selectedParent: state.selectedParent,
        parentStatusFilter: state.parentStatusFilter,
        parentStageFilter: state.parentStageFilter,
        childMode: state.childMode,
        childDeptFilter: state.childDeptFilter,
        childStageFilter: state.childStageFilter,
        hideAdded: state.hideAdded,
        relations: state.relations,
        completedParents: state.completedParents,
        lastSavedAt: state.lastSavedAt
      }));
    }

    function findCycles(){
      const g = new Map();
      for(const r of state.relations){
        if(!g.has(r.parentErpCode)) g.set(r.parentErpCode, []);
        g.get(r.parentErpCode).push(r.childErpCode);
      }
      const cyc = [], path = [], ing = new Set(), done = new Set();
      function v(c){
        if(ing.has(c)){ cyc.push([...path.slice(path.indexOf(c)), c]); return; }
        if(done.has(c)) return;
        ing.add(c); path.push(c);
        for(const ch of (g.get(c) || [])) v(ch);
        path.pop(); ing.delete(c); done.add(c);
      }
      for(const k of g.keys()) v(k);
      return cyc;
    }

    function buildIssues(){
      const out = [], dup = new Map(), childParents = new Map();
      for(const rel of state.relations){
        const p = itemByCode.get(rel.parentErpCode);
        const c = itemByCode.get(rel.childErpCode);
        const k = rel.parentErpCode + "=>" + rel.childErpCode;
        dup.set(k, (dup.get(k) || 0) + 1);
        if(!childParents.has(rel.childErpCode)) childParents.set(rel.childErpCode, new Set());
        childParents.get(rel.childErpCode).add(rel.parentErpCode);

        if(!p) out.push({sev:"error",rel:rel.id,parent:rel.parentErpCode,child:rel.childErpCode,
          title:"상위 품목을 찾을 수 없어요",
          desc:`코드 ${rel.parentErpCode} 가 원장에 없습니다. 다른 품목으로 바꿔주세요.`});
        if(!c) out.push({sev:"error",rel:rel.id,parent:rel.parentErpCode,child:rel.childErpCode,
          title:"하위 부품을 찾을 수 없어요",
          desc:`코드 ${rel.childErpCode} 가 원장에 없습니다. 이 줄을 빼주세요.`});
        if(rel.parentErpCode === rel.childErpCode) out.push({sev:"error",rel:rel.id,parent:rel.parentErpCode,child:rel.childErpCode,
          title:"자기 자신을 하위로 넣을 수 없어요",
          desc:"같은 부품을 자기 하위에 넣을 수 없습니다. 이 줄을 빼주세요."});
        if(!Number.isFinite(Number(rel.quantity)) || Number(rel.quantity) <= 0) out.push({sev:"error",rel:rel.id,parent:rel.parentErpCode,child:rel.childErpCode,
          title:"수량이 잘못됐어요",
          desc:"수량은 1 이상이어야 합니다. ＋ 버튼으로 늘려주세요."});
        const rule = relationRule(p, c);
        if(p && c && rule.kind === "warn") out.push({sev:"warn",rel:rel.id,parent:rel.parentErpCode,child:rel.childErpCode,
          title:"공정 조합을 확인해주세요",
          desc:`${rule.reason}. 정말 맞다면 비고에 이유를 적어주세요. (${deptLabel(c.processType)} → ${deptLabel(p.processType)})`});
      }
      for(const [k, n] of dup) if(n > 1){
        const [pp, cc] = k.split("=>");
        out.push({sev:"error",parent:pp,child:cc,
          title:"같은 부품이 두 번 들어가 있어요",
          desc:`'${describeCode(cc)}' 가 ${n}번 들어가 있습니다. 한 줄만 남기고 나머지를 빼주세요.`});
      }
      for(const [ch, par] of childParents) if(par.size > 1) out.push({sev:"warn",parent:[...par][0],child:ch,
        title:"같은 부품이 여러 상위 품목에 들어가 있어요",
        desc:`'${describeCode(ch)}' 가 ${par.size}곳에 쓰입니다. 의도한 게 맞는지 확인해주세요.`});
      for(const cyc of findCycles()) out.push({sev:"error",parent:cyc[0],child:cyc[1] || cyc[0],
        title:"부품끼리 서로의 하위가 되어 있어요",
        desc:`${cyc.join(" → ")} 처럼 빙글 도는 관계입니다. 한쪽을 빼주세요.`});
      return out;
    }

    function relationSeverity(relId, issues){
      const own = issues.filter(i => i.rel === relId);
      if(own.some(i => i.sev === "error")) return "error";
      if(own.length) return "warn";
      return "";
    }

    function go(view){
      state.view = view;
      render();
      window.scrollTo(0,0);
    }

    function render(){
      document.querySelector(".app").dataset.view = state.view;
      if(state.view === "main") renderMain();
      else if(state.view === "parent") renderParent();
      else if(state.view === "edit") renderEdit();
      else if(state.view === "review") renderReview();
    }

    // ===== Main view: tabs =====
    function isCompleted(code){ return state.completedParents.includes(code); }
    function hasWork(code){ return state.relations.some(r => r.parentErpCode === code); }

    function renderMain(){
      const completedCount = state.completedParents.length;
      const pendingCount = parentItems.filter(p => !isCompleted(p.erpCode)).length;
      document.getElementById("view-main").innerHTML = `
        <header class="main-header">
          <div class="topline">
            <h1><span class="logo">📋</span>BOM 작업</h1>
            <span class="meta-line">${esc(CATALOG.itemCount)}개 품목 · 원장 ${esc(CATALOG.checksum)}</span>
          </div>
          <div class="tabs">
            <button class="tab ${state.activeTab === "work" ? "active" : ""}" data-tab="work">📂 작업하기<span class="badge">${parentItems.length}</span></button>
            <button class="tab ${state.activeTab === "done" ? "active" : ""}" data-tab="done">✓ 완료한 BOM<span class="badge">${completedCount}</span></button>
            <button class="tab ${state.activeTab === "pending" ? "active" : ""}" data-tab="pending">⏳ 아직 안 한 것<span class="badge">${pendingCount}</span></button>
          </div>
        </header>
        <div class="tab-content" id="tabContent"></div>
      `;
      document.querySelectorAll("#view-main .tab").forEach(b => b.addEventListener("click", () => {
        state.activeTab = b.dataset.tab;
        renderMain();
      }));
      renderActiveTab();
    }

    function renderActiveTab(){
      const c = document.getElementById("tabContent");
      if(!c) return;
      if(state.activeTab === "work") renderTabWork(c);
      else if(state.activeTab === "done") renderTabDone(c);
      else if(state.activeTab === "pending") renderTabPending(c);
    }

    function renderTabWork(c){
      const cards = DEPARTMENTS.map(d => {
        const own = parentItems.filter(p => d.processes.includes(p.processType));
        const done = own.filter(p => isCompleted(p.erpCode)).length;
        const working = own.filter(p => !isCompleted(p.erpCode) && hasWork(p.erpCode)).length;
        const stages = d.processes.join(" · ");
        return `<button class="dept-card" data-dept="${d.code}" style="--strip:var(--dept-${d.code})">
          <span class="emoji">${d.emoji}</span>
          <span class="name">${esc(d.name)}</span>
          <span class="stages">${esc(stages)}</span>
          <span class="count">상위 품목 ${own.length}개${done ? ` · 끝남 ${done}` : ""}${working ? ` · 작업 중 ${working}` : ""}</span>
        </button>`;
      }).join("");
      c.innerHTML = `
        <div class="panel-header">
          <h2>부서를 골라주세요</h2>
          <span class="panel-sub">부서를 누르면 상위 품목 목록으로 갑니다</span>
        </div>
        <div class="dept-grid">${cards}</div>
      `;
      c.querySelectorAll(".dept-card").forEach(b => b.addEventListener("click", () => {
        state.selectedDept = b.dataset.dept;
        state.parentSearch = "";
        saveDraft();
        go("parent");
      }));
    }

    function renderTabDone(c){
      const completed = state.completedParents
        .map(code => itemByCode.get(code))
        .filter(Boolean);
      const headerHtml = completed.length ? `
        <div class="panel-header">
          <h2>완료한 BOM (${completed.length}건)</h2>
          <button id="downloadAll" class="primary cta" style="min-height:48px">📥 전체 다운로드 (CSV)</button>
        </div>` : `
        <div class="panel-header">
          <h2>완료한 BOM</h2>
          <span class="panel-sub">완료된 BOM이 모이면 여기서 한 번에 다운로드합니다</span>
        </div>`;
      const list = completed.length ? `<div class="item-list">${completed.map(p => {
        const rels = state.relations.filter(r => r.parentErpCode === p.erpCode);
        return `<div class="item-card done-card" style="--strip:${stripVar(p.processType)}">
          <div class="body">
            <div class="name">${esc(p.itemName)}</div>
            <div class="meta">
              <span class="code">${esc(p.erpCode)}</span>
              <span>${esc(deptLabel(p.processType))}</span>
              <span>하위 ${rels.length}개</span>
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="small reopen-btn" data-code="${esc(p.erpCode)}">다시 열기</button>
            <button class="small undo-btn" data-code="${esc(p.erpCode)}">완료 취소</button>
          </div>
        </div>`;
      }).join("")}</div>` : `<div class="empty-state">
        아직 완료한 BOM이 없습니다.<div class="arrow">↑</div><strong>「작업하기」</strong> 탭에서 부서를 고르고 BOM을 만든 뒤, 검토 화면에서 <strong>「완료 처리」</strong>를 누르세요.
      </div>`;
      c.innerHTML = headerHtml + list;
      const dl = document.getElementById("downloadAll");
      if(dl) dl.addEventListener("click", downloadAllCompleted);
      c.querySelectorAll(".reopen-btn").forEach(b => b.addEventListener("click", () => {
        state.selectedParent = b.dataset.code;
        const p = itemByCode.get(b.dataset.code);
        if(p) state.selectedDept = (deptOf(p.processType)||{}).code || state.selectedDept;
        saveDraft(); go("edit");
      }));
      c.querySelectorAll(".undo-btn").forEach(b => b.addEventListener("click", () => {
        state.completedParents = state.completedParents.filter(x => x !== b.dataset.code);
        saveDraft();
        toast("완료 취소했어요", "ok");
        renderMain();
      }));
    }

    function renderTabPending(c){
      const kw = norm(state.pendingSearch);
      let pending = parentItems.filter(p => !isCompleted(p.erpCode));
      if(kw) pending = pending.filter(p => p.searchText.includes(kw));
      const grouped = DEPARTMENTS.map(d => ({
        dept: d,
        items: pending.filter(p => d.processes.includes(p.processType))
      })).filter(g => g.items.length);
      const groupHtml = grouped.length ? grouped.map(g => `
        <div class="panel-header" style="margin-top:8px">
          <h2 style="font-size:16px;display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--dept-${g.dept.code})"></span>${esc(g.dept.emoji)} ${esc(g.dept.name)} <span style="color:var(--muted);font-weight:400;font-size:14px">(${g.items.length}건)</span></h2>
        </div>
        <div class="item-list">${g.items.map(p => {
          const working = hasWork(p.erpCode);
          const status = working ? `<span class="status status-doing">작업 중 (${state.relations.filter(r => r.parentErpCode === p.erpCode).length}건)</span>` : `<span class="status status-empty">아직 안 함</span>`;
          return `<button class="item-card" data-code="${esc(p.erpCode)}" style="--strip:${stripVar(p.processType)}">
            <div class="body">
              <div class="name">${esc(p.itemName)}</div>
              <div class="meta">
                <span class="code">${esc(p.erpCode)}</span>
                <span>${esc(deptLabel(p.processType))}</span>
                ${p.category ? `<span>${esc(p.category)}</span>` : ""}
              </div>
            </div>
            ${status}
          </button>`;
        }).join("")}</div>
      `).join("") : `<div class="empty-state">${kw ? "검색 결과가 없습니다." : "🎉 모든 상위 품목 작업이 끝났어요!"}</div>`;
      c.innerHTML = `
        <div class="panel-header">
          <h2>아직 안 한 상위 품목 (${pending.length}건)</h2>
          <span class="panel-sub">눌러서 BOM 작업을 시작하세요</span>
        </div>
        <input id="pendingSearch" type="search" class="big" placeholder="🔍 품명이나 코드로 찾기" value="${esc(state.pendingSearch)}" autocomplete="off">
        ${groupHtml}
      `;
      const ps = document.getElementById("pendingSearch");
      ps.addEventListener("input", e => { state.pendingSearch = e.target.value; renderActiveTab(); });
      c.querySelectorAll(".item-card[data-code]").forEach(b => b.addEventListener("click", () => {
        const p = itemByCode.get(b.dataset.code);
        state.selectedParent = b.dataset.code;
        if(p) state.selectedDept = (deptOf(p.processType)||{}).code || state.selectedDept;
        state.expandedNotesId = null;
        state.childSearch = "";
        saveDraft();
        go("edit");
      }));
    }

    // ===== Step 2: Parent =====
    function renderParent(){
      const dept = DEPARTMENTS.find(d => d.code === state.selectedDept);
      if(!dept){ go("department"); return; }
      const issues = buildIssues();
      const kw = norm(state.parentSearch);
      let pool = state.showAllDepts ? parentItems : parentItems.filter(p => dept.processes.includes(p.processType));
      if(kw) pool = pool.filter(p => p.searchText.includes(kw));
      if(state.parentStageFilter !== "ALL") pool = pool.filter(p => stageCode(p.processType) === state.parentStageFilter);

      function statusOf(code){
        const own = state.relations.filter(r => r.parentErpCode === code);
        const errs = issues.filter(i => i.parent === code && i.sev === "error");
        if(!own.length) return {label:"아직 안 함", klass:"status-empty", kind:"empty"};
        if(errs.length) return {label:`고칠 곳 ${errs.length}군데`, klass:"status-error", kind:"issue"};
        const allConfirmed = own.every(r => r.confirmed);
        if(isCompleted(code)) return {label:`완료 처리됨 (${own.length}건)`, klass:"status-done", kind:"done"};
        return {label:allConfirmed ? `검수 끝남 (${own.length}건)` : `작업 중 (${own.length}건)`, klass:allConfirmed ? "status-done" : "status-doing", kind:allConfirmed ? "done" : "working"};
      }
      if(state.parentStatusFilter !== "all") pool = pool.filter(p => statusOf(p.erpCode).kind === state.parentStatusFilter);

      const statusChips = PARENT_STATUS_FILTERS.map(f => `<button class="chip parent-status-chip ${state.parentStatusFilter === f.code ? "active" : ""}" data-value="${f.code}">${esc(f.label)}</button>`).join("");
      const stageChips = PARENT_STAGE_FILTERS.map(f => `<button class="chip parent-stage-chip ${state.parentStageFilter === f.code ? "active" : ""}" data-value="${f.code}">${esc(f.label)}</button>`).join("");

      const list = pool.length ? pool.map(p => {
        const s = statusOf(p.erpCode);
        return `<button class="item-card" data-code="${esc(p.erpCode)}" style="--strip:${stripVar(p.processType)}">
          <div class="body">
            <div class="name">${esc(p.itemName)}</div>
            <div class="meta">
              <span class="code">${esc(p.erpCode)}</span>
              <span>${esc(deptLabel(p.processType))}</span>
              ${p.category ? `<span>${esc(p.category)}</span>` : ""}
            </div>
          </div>
          <span class="status ${s.klass}">${esc(s.label)}</span>
        </button>`;
      }).join("") : `<div class="empty-state">검색 결과가 없습니다.<br><strong>다른 검색어</strong>로 다시 시도해보세요.</div>`;

      document.getElementById("view-parent").innerHTML = `
        <header class="view-header">
          <button class="back-link" id="parentBack">← 작업 화면으로</button>
          <div class="titleblock">
            <div class="view-title">${esc(dept.emoji)} ${esc(dept.name)} 상위 품목</div>
            <div class="view-sub">BOM을 만들 품목을 골라주세요 (${pool.length}개)</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="showAll" ${state.showAllDepts ? "checked" : ""}>
            <span>다른 부서도 보기</span>
          </label>
        </header>
        <div class="view-body">
          <div class="filter-stack">
            <input id="parentSearch" type="search" class="big" placeholder="🔍 품명이나 코드로 찾기" value="${esc(state.parentSearch)}" autocomplete="off">
            <div class="filter-row">
              <span class="filter-label">상태</span>
              ${statusChips}
            </div>
            <div class="filter-row">
              <span class="filter-label">단계</span>
              ${stageChips}
              <span class="mini-stat">${pool.length}개 표시</span>
            </div>
          </div>
          <div class="item-list">${list}</div>
        </div>
      `;
      document.getElementById("parentBack").addEventListener("click", () => go("main"));
      document.getElementById("showAll").addEventListener("change", e => { state.showAllDepts = e.target.checked; renderParent(); });
      const search = document.getElementById("parentSearch");
      search.addEventListener("input", e => { state.parentSearch = e.target.value; renderParent(); });
      document.querySelectorAll("#view-parent .parent-status-chip").forEach(b => b.addEventListener("click", () => {
        state.parentStatusFilter = b.dataset.value;
        saveDraft();
        renderParent();
      }));
      document.querySelectorAll("#view-parent .parent-stage-chip").forEach(b => b.addEventListener("click", () => {
        state.parentStageFilter = b.dataset.value;
        saveDraft();
        renderParent();
      }));
      document.querySelectorAll("#view-parent .item-card").forEach(c => c.addEventListener("click", () => {
        state.selectedParent = c.dataset.code;
        state.expandedNotesId = null;
        state.childSearch = "";
        saveDraft();
        go("edit");
      }));
    }

    // ===== Step 3: Edit =====
    function renderEdit(){
      const parent = itemByCode.get(state.selectedParent);
      if(!parent){ go("parent"); return; }
      const issues = buildIssues();
      const myRels = state.relations.filter(r => r.parentErpCode === state.selectedParent);
      const myIssues = issues.filter(i => i.parent === state.selectedParent);
      const myErrors = myIssues.filter(i => i.sev === "error").length;
      const myWarns = myIssues.length - myErrors;

      const savedTxt = state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}) : "-";

      const rowsHtml = myRels.length ? myRels.map(rel => {
        const child = itemByCode.get(rel.childErpCode);
        const sev = relationSeverity(rel.id, issues);
        const own = issues.filter(i => i.rel === rel.id);
        const issueLine = own.length ? `<div class="bom-issue"><span>⚠</span><span>${esc(own[0].title)} — ${esc(own[0].desc)}</span></div>` : "";
        const expanded = state.expandedNotesId === rel.id ? " expanded" : "";
        return `<div class="bom-row ${sev}${expanded}" data-id="${esc(rel.id)}" style="--strip:${stripVar(child?.processType)}">
          <div class="body">
            <div class="name">${esc(child?.itemName || "알 수 없는 부품")}</div>
            <div class="sub">
              <span class="code">${esc(rel.childErpCode)}</span>
              <span>${esc(deptLabel(child?.processType))}</span>
              <label class="switch">
                <input type="checkbox" data-action="confirm" ${rel.confirmed ? "checked" : ""}>
                <span>검수 끝남</span>
              </label>
            </div>
          </div>
          <div class="qty-stepper">
            <button data-action="qty-down" title="수량 줄이기">−</button>
            <input type="number" data-action="qty" value="${esc(fmtQty(rel.quantity))}" min="1" step="1">
            <button data-action="qty-up" title="수량 늘리기">＋</button>
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-action="notes" title="비고 적기">✎</button>
            <button class="icon-btn danger" data-action="delete" title="이 부품 빼기">×</button>
          </div>
          ${issueLine}
          <div class="bom-notes">
            <textarea data-action="notes-input" placeholder="비고 / 메모 (이유, 특이사항 등)">${esc(rel.notes || "")}</textarea>
          </div>
        </div>`;
      }).join("") : `<div class="empty-state">
        아직 하위 부품이 없습니다.
        <div class="arrow">→</div>
        오른쪽에서 부품을 골라 한 번 눌러주세요.
      </div>`;

      const kw = norm(state.childSearch);
      const selectedSet = new Set(myRels.map(r => r.childErpCode));
      let candidates = ITEMS
        .filter(it => it.erpCode !== state.selectedParent)
        .map(it => ({it, rule: relationRule(parent, it)}));
      if(state.childMode === "recommended") candidates = candidates.filter(x => x.rule.kind !== "warn");
      if(state.childMode === "prevFinal") candidates = candidates.filter(x => x.rule.kind === "best");
      if(state.childDeptFilter !== "ALL") candidates = candidates.filter(x => deptOf(x.it.processType)?.code === state.childDeptFilter);
      if(state.childStageFilter !== "ALL") candidates = candidates.filter(x => stageCode(x.it.processType) === state.childStageFilter);
      if(state.hideAdded) candidates = candidates.filter(x => !selectedSet.has(x.it.erpCode));
      if(kw) candidates = candidates.filter(x => x.it.searchText.includes(kw));
      candidates.sort((a, b) => {
        const ka = a.rule.score
                  + (kw && a.it.itemName.toLowerCase().includes(kw) ? 50 : 0)
                  + (kw && a.it.erpCode.toLowerCase().startsWith(kw) ? 80 : 0)
                  + Math.max(0, 30 - Math.abs(PROCESS_INDEX[parent.processType] - PROCESS_INDEX[a.it.processType]) * 3)
                  - (selectedSet.has(a.it.erpCode) ? 500 : 0);
        const kb = b.rule.score
                  + (kw && b.it.itemName.toLowerCase().includes(kw) ? 50 : 0)
                  + (kw && b.it.erpCode.toLowerCase().startsWith(kw) ? 80 : 0)
                  + Math.max(0, 30 - Math.abs(PROCESS_INDEX[parent.processType] - PROCESS_INDEX[b.it.processType]) * 3)
                  - (selectedSet.has(b.it.erpCode) ? 500 : 0);
        return kb - ka || a.it.sortOrder - b.it.sortOrder;
      });
      const candidatesShown = candidates.slice(0, 200);
      const modeChips = CHILD_MODES.map(f => `<button class="chip child-mode-chip ${state.childMode === f.code ? "active" : ""}" data-value="${f.code}">${esc(f.label)}</button>`).join("");
      const deptChips = [{code:"ALL",name:"전체",emoji:""}].concat(DEPARTMENTS).map(d => `<button class="chip child-dept-chip ${state.childDeptFilter === d.code ? "active" : ""}" data-value="${d.code}">${esc(d.emoji ? d.emoji + " " : "")}${esc(d.name)}</button>`).join("");
      const stageChips = STAGE_FILTERS.map(f => `<button class="chip child-stage-chip ${state.childStageFilter === f.code ? "active" : ""}" data-value="${f.code}">${esc(f.label)}</button>`).join("");

      const candHtml = candidatesShown.length ? candidatesShown.map(it => {
        const item = it.it;
        const rule = it.rule;
        const added = selectedSet.has(item.erpCode);
        const tagClass = added ? "added" : rule.kind;
        return `<button class="candidate ${added ? "added" : ""} ${rule.kind === "warn" ? "warn" : ""} ${rule.kind === "best" ? "best" : ""}" data-code="${esc(item.erpCode)}" ${added ? "disabled" : ""} style="--strip:${stripVar(item.processType)}">
          <div class="body">
            <div class="name">${esc(item.itemName)}</div>
            <div class="sub">
              <span class="code">${esc(item.erpCode)}</span>
              <span>${esc(deptLabel(item.processType))}</span>
              <span class="tag ${tagClass}">${esc(added ? "추가됨" : rule.label)}</span>
            </div>
          </div>
          <div class="add-icon">${added ? "✓" : "＋"}</div>
        </button>`;
      }).join("") : `<div class="empty-state">검색 결과가 없습니다.</div>`;

      let statusKlass = "ok", statusText = "문제 없음 ✓";
      if(myErrors){ statusKlass = "error"; statusText = `고쳐야 할 곳 ${myErrors}군데 ⚠`; }
      else if(myWarns){ statusKlass = "warn"; statusText = `확인할 곳 ${myWarns}군데 ⚠`; }

      document.getElementById("view-edit").innerHTML = `
        <header class="view-header">
          <button class="back-link" id="editBack">← 다른 상위품목 고르기</button>
          <div class="titleblock"></div>
          <div class="saved-pill">자동 저장 · ${esc(savedTxt)}</div>
        </header>
        <div class="view-body">
          <div class="edit-top" style="--strip:${stripVar(parent.processType)}">
            <div class="label">지금 작업 중</div>
            <div class="name">${esc(parent.itemName)}</div>
            <div class="meta">
              <span class="code">${esc(parent.erpCode)}</span>
              <span>${esc(deptLabel(parent.processType))}</span>
              ${parent.category ? `<span>${esc(parent.category)}</span>` : ""}
              <span class="progress-pill">하위 부품 ${myRels.length}개</span>
            </div>
          </div>
          <div class="edit-cols">
            <div class="edit-col">
              <div class="col-head">
                <h3>📋 추가된 하위 부품</h3>
                <span class="count">${myRels.length}건</span>
                <div class="tool-row">
                  <button id="confirmAllRows" class="small" ${myRels.length ? "" : "disabled"}>모두 검수</button>
                  <button id="clearConfirmRows" class="small" ${myRels.length ? "" : "disabled"}>검수 해제</button>
                  <button id="downloadCurrentBom" class="small" ${myRels.length ? "" : "disabled"}>현재 BOM CSV</button>
                  ${state.lastDeletedRelation && state.lastDeletedRelation.parentErpCode === state.selectedParent ? `<button id="undoDelete" class="small">삭제 취소</button>` : ""}
                </div>
              </div>
              <div class="col-body" id="editRows">${rowsHtml}</div>
            </div>
            <div class="edit-col">
              <div class="col-head">
                <h3>＋ 추가할 부품 고르기</h3>
                <span class="count">${candidates.length}개${candidates.length > 200 ? " (200개만 표시)" : ""}</span>
              </div>
              <div class="col-search">
                <input id="childSearch" type="search" placeholder="🔍 품명이나 코드로 찾기" value="${esc(state.childSearch)}" autocomplete="off">
                <div class="filter-row tight">
                  <span class="filter-label">후보</span>
                  ${modeChips}
                  <label class="switch" style="margin-left:auto">
                    <input type="checkbox" id="hideAdded" ${state.hideAdded ? "checked" : ""}>
                    <span>추가된 항목 숨김</span>
                  </label>
                </div>
                <div class="filter-row tight">
                  <span class="filter-label">부서</span>
                  ${deptChips}
                </div>
                <div class="filter-row tight">
                  <span class="filter-label">단계</span>
                  ${stageChips}
                  <button id="childResetFilters" class="small ghost" style="margin-left:auto">필터 초기화</button>
                </div>
              </div>
              <div class="col-body" id="editCands">${candHtml}</div>
            </div>
          </div>
        </div>
        <footer class="view-footer">
          <div class="footer-pill ${statusKlass}">${esc(statusText)}</div>
          <div class="spacer"></div>
          <button id="editToReview" class="primary cta" ${myRels.length === 0 ? "disabled" : ""}>다음: 검토하기 →</button>
        </footer>
      `;

      document.getElementById("editBack").addEventListener("click", () => go("parent"));
      document.getElementById("editToReview").addEventListener("click", () => {
        if(myRels.length === 0){ toast("하위 부품을 1개 이상 추가해주세요", "warn"); return; }
        go("review");
      });

      const cs = document.getElementById("childSearch");
      cs.addEventListener("input", e => { state.childSearch = e.target.value; renderEdit(); });
      document.getElementById("confirmAllRows")?.addEventListener("click", () => confirmAllCurrent(true));
      document.getElementById("clearConfirmRows")?.addEventListener("click", () => confirmAllCurrent(false));
      document.getElementById("downloadCurrentBom")?.addEventListener("click", downloadCurrentParent);
      document.getElementById("undoDelete")?.addEventListener("click", restoreLastDeleted);
      document.getElementById("hideAdded")?.addEventListener("change", e => {
        state.hideAdded = e.target.checked;
        saveDraft();
        renderEdit();
      });
      document.getElementById("childResetFilters")?.addEventListener("click", () => {
        state.childSearch = "";
        state.childMode = "recommended";
        state.childDeptFilter = "ALL";
        state.childStageFilter = "ALL";
        state.hideAdded = true;
        saveDraft();
        renderEdit();
      });
      document.querySelectorAll("#view-edit .child-mode-chip").forEach(b => b.addEventListener("click", () => {
        state.childMode = b.dataset.value;
        saveDraft();
        renderEdit();
      }));
      document.querySelectorAll("#view-edit .child-dept-chip").forEach(b => b.addEventListener("click", () => {
        state.childDeptFilter = b.dataset.value;
        saveDraft();
        renderEdit();
      }));
      document.querySelectorAll("#view-edit .child-stage-chip").forEach(b => b.addEventListener("click", () => {
        state.childStageFilter = b.dataset.value;
        saveDraft();
        renderEdit();
      }));

      document.querySelectorAll("#editCands .candidate").forEach(c => c.addEventListener("click", () => {
        if(c.disabled) return;
        addRelationDirect(c.dataset.code);
      }));

      document.querySelectorAll("#editRows .bom-row").forEach(row => {
        const id = row.dataset.id;
        const find = sel => row.querySelector(`[data-action="${sel}"]`);
        find("qty-down")?.addEventListener("click", () => changeQty(id, -1));
        find("qty-up")?.addEventListener("click", () => changeQty(id, +1));
        find("qty")?.addEventListener("change", e => setQty(id, Number(e.target.value)));
        find("confirm")?.addEventListener("change", e => setConfirm(id, e.target.checked));
        find("notes")?.addEventListener("click", () => {
          state.expandedNotesId = state.expandedNotesId === id ? null : id;
          renderEdit();
          if(state.expandedNotesId === id){
            const ta = document.querySelector(`.bom-row[data-id="${id}"] textarea`);
            ta?.focus();
          }
        });
        find("notes-input")?.addEventListener("input", e => setNotes(id, e.target.value));
        find("delete")?.addEventListener("click", () => {
          if(confirm("이 부품을 BOM에서 빼시겠어요?")) deleteRelation(id);
        });
      });
    }

    function confirmAllCurrent(value){
      const rows = state.relations.filter(r => r.parentErpCode === state.selectedParent);
      if(!rows.length){ toast("검수할 부품이 없어요", "warn"); return; }
      rows.forEach(r => r.confirmed = !!value);
      saveDraft();
      toast(value ? "현재 BOM을 모두 검수 처리했어요" : "검수 표시를 해제했어요", "ok");
      renderEdit();
    }
    function downloadCurrentParent(){
      const parent = itemByCode.get(state.selectedParent);
      const rows = state.relations.filter(r => r.parentErpCode === state.selectedParent);
      if(!parent || !rows.length){ toast("다운로드할 BOM이 없어요", "warn"); return; }
      download(`bom_${safeFilename(parent.erpCode)}_${stamp()}.csv`, relationCsv(rows), "text/csv;charset=utf-8");
      toast("현재 BOM CSV를 저장했어요", "ok");
    }
    function restoreLastDeleted(){
      const rel = state.lastDeletedRelation;
      if(!rel || rel.parentErpCode !== state.selectedParent){ toast("되돌릴 삭제 항목이 없어요", "warn"); return; }
      if(state.relations.some(r => r.parentErpCode === rel.parentErpCode && r.childErpCode === rel.childErpCode)){
        state.lastDeletedRelation = null;
        saveDraft();
        toast("이미 다시 들어가 있어요", "warn");
        renderEdit();
        return;
      }
      state.relations.push({...rel, id: uid()});
      state.lastDeletedRelation = null;
      saveDraft();
      toast("방금 뺀 부품을 되돌렸어요", "ok");
      renderEdit();
    }
    function addRelationDirect(childCode){
      if(!itemByCode.has(childCode)){ toast("부품을 찾을 수 없어요", "error"); return; }
      if(state.relations.some(r => r.parentErpCode === state.selectedParent && r.childErpCode === childCode)){
        toast("이미 들어가 있는 부품이에요", "warn"); return;
      }
      state.relations.push({
        id: uid(),
        parentErpCode: state.selectedParent,
        childErpCode: childCode,
        quantity: 1,
        unit: "EA",
        confirmed: false,
        notes: ""
      });
      saveDraft();
      const child = itemByCode.get(childCode);
      toast(`'${child?.itemName || childCode}' 추가했어요`, "ok");
      renderEdit();
    }
    function changeQty(id, delta){
      const rel = state.relations.find(r => r.id === id); if(!rel) return;
      rel.quantity = Math.max(1, (Number(rel.quantity) || 1) + delta);
      saveDraft(); renderEdit();
    }
    function setQty(id, n){
      const rel = state.relations.find(r => r.id === id); if(!rel) return;
      rel.quantity = (Number.isFinite(n) && n > 0) ? n : 1;
      saveDraft(); renderEdit();
    }
    function setConfirm(id, v){
      const rel = state.relations.find(r => r.id === id); if(!rel) return;
      rel.confirmed = !!v;
      saveDraft(); renderEdit();
    }
    function setNotes(id, v){
      const rel = state.relations.find(r => r.id === id); if(!rel) return;
      rel.notes = String(v || "");
      saveDraft();
    }
    function deleteRelation(id){
      const rel = state.relations.find(r => r.id === id);
      state.lastDeletedRelation = rel ? {...rel} : null;
      state.relations = state.relations.filter(r => r.id !== id);
      if(state.expandedNotesId === id) state.expandedNotesId = null;
      saveDraft();
      toast("부품을 뺐어요", "ok");
      renderEdit();
    }

    // ===== Step 4: Review =====
    function renderReview(){
      const parent = itemByCode.get(state.selectedParent);
      if(!parent){ go("parent"); return; }
      const issues = buildIssues();
      const myRels = state.relations.filter(r => r.parentErpCode === state.selectedParent);
      const myIssues = issues.filter(i => i.parent === state.selectedParent);
      const myErrors = myIssues.filter(i => i.sev === "error");
      const myWarns = myIssues.filter(i => i.sev === "warn");
      const confirmedCount = myRels.filter(r => r.confirmed).length;
      const allConfirmed = myRels.length > 0 && confirmedCount === myRels.length;

      const okCard = `<div class="summary-card ok">
        <div class="head">✓ 잘된 점</div>
        <div class="big">하위 부품 ${myRels.length}개</div>
        <div class="desc">${allConfirmed ? "모두 검수 끝남" : `${confirmedCount}/${myRels.length}개 검수 끝남`}</div>
      </div>`;
      let problemCard;
      if(myErrors.length){
        problemCard = `<div class="summary-card error">
          <div class="head">✗ 고쳐야 할 곳</div>
          <div class="big">${myErrors.length}군데</div>
          <div class="desc">아래 빨간 항목을 먼저 고쳐주세요. 다 고쳐야 제출할 수 있어요.</div>
        </div>`;
      } else if(myWarns.length){
        problemCard = `<div class="summary-card warn">
          <div class="head">⚠ 확인이 필요한 곳</div>
          <div class="big">${myWarns.length}군데</div>
          <div class="desc">제출은 가능하지만 한 번 확인해주세요.</div>
        </div>`;
      } else {
        problemCard = `<div class="summary-card ok">
          <div class="head">✓ 문제 없음</div>
          <div class="big">바로 제출 가능</div>
          <div class="desc">고쳐야 할 곳도, 확인할 곳도 없어요.</div>
        </div>`;
      }

      const itemsHtml = myRels.map(rel => {
        const c = itemByCode.get(rel.childErpCode);
        const sev = relationSeverity(rel.id, issues);
        const cls = sev || "ok";
        const icon = sev === "error" ? "✗" : sev === "warn" ? "!" : "✓";
        return `<div class="review-item ${cls}">
          <span class="icon">${icon}</span>
          <div>
            <div class="name">${esc(c?.itemName || "알 수 없는 부품")}</div>
            <div class="sub"><span class="code">${esc(rel.childErpCode)}</span> · ${esc(deptLabel(c?.processType))}${rel.confirmed ? " · 검수 끝남" : ""}${rel.notes ? ` · ${esc(rel.notes)}` : ""}</div>
          </div>
          <div class="qty-text">${esc(fmtQty(rel.quantity))} ${esc(rel.unit)}</div>
        </div>`;
      }).join("");

      const issuesHtml = myIssues.length ? `<div class="issue-list">${myIssues.map(i => `
        <div class="issue-card ${i.sev}">
          <span class="icon">${i.sev === "error" ? "✗" : "⚠"}</span>
          <div class="body">
            <div class="title">${esc(i.title)}</div>
            <div class="desc">${esc(i.desc)}</div>
          </div>
        </div>`).join("")}</div>` : "";

      document.getElementById("view-review").innerHTML = `
        <header class="view-header">
          <button class="back-link" id="reviewBack">← 더 작업하기</button>
          <div class="titleblock">
            <div class="view-title">검토 + 제출</div>
            <div class="view-sub">${esc(parent.itemName)} (${esc(parent.erpCode)})</div>
          </div>
          <div class="menu-btn" id="moreMenu">
            <button class="ghost icon-btn" id="moreBtn" title="더보기">⋯</button>
            <div class="menu">
              <button id="menuConfirmAll">📋 모든 줄 한 번에 검수 끝남</button>
              <button id="menuSaveJson">💾 작업파일 저장 (.json)</button>
              <button id="menuLoadJson">📂 파일 불러오기</button>
              <button id="menuReset" class="danger-item">🗑 이 BOM 모두 지우기</button>
            </div>
          </div>
        </header>
        <div class="view-body">
          <div class="review-summary">${okCard}${problemCard}</div>
          ${issuesHtml}
          <div class="review-list">${itemsHtml}</div>
        </div>
        <footer class="view-footer">
          <div class="footer-pill">총 ${myRels.length}개 부품</div>
          <div class="spacer"></div>
          <button id="reviewSubmit" class="primary cta" ${myErrors.length ? "disabled" : ""}>${myErrors.length ? "먼저 빨간 항목을 고쳐주세요" : (isCompleted(state.selectedParent) ? "✓ 다시 완료 처리" : "✓ 이 BOM 완료 처리")}</button>
        </footer>
      `;

      document.getElementById("reviewBack").addEventListener("click", () => go("edit"));
      document.getElementById("reviewSubmit").addEventListener("click", markComplete);
      document.getElementById("moreBtn").addEventListener("click", e => {
        e.stopPropagation();
        document.getElementById("moreMenu").classList.toggle("open");
      });
      document.getElementById("menuConfirmAll").addEventListener("click", () => {
        myRels.forEach(r => r.confirmed = true);
        saveDraft();
        toast("모든 줄 검수 처리했어요", "ok");
        renderReview();
      });
      document.getElementById("menuSaveJson").addEventListener("click", saveJsonFile);
      document.getElementById("menuLoadJson").addEventListener("click", () => document.getElementById("jsonFileInput").click());
      document.getElementById("menuReset").addEventListener("click", () => {
        if(!confirm("이 상위품목의 모든 하위 부품을 지웁니다. 계속할까요?")) return;
        state.relations = state.relations.filter(r => r.parentErpCode !== state.selectedParent);
        saveDraft();
        toast("모두 지웠어요", "ok");
        go("parent");
      });

      document.addEventListener("click", closeMenuHandler);
      function closeMenuHandler(e){
        if(!e.target.closest("#moreMenu")){
          document.querySelectorAll(".menu-btn.open").forEach(m => m.classList.remove("open"));
          document.removeEventListener("click", closeMenuHandler);
        }
      }
    }

    function csvEscape(v){
      const t = String(v ?? "");
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }
    function relationCsv(rows){
      const header = ["parent_erp_code","parent_item_name","parent_process_type","child_erp_code","child_item_name","child_process_type","quantity","unit","confirmed","notes"];
      const lines = [header.join(",")];
      for(const r of rows){
        const p = itemByCode.get(r.parentErpCode), c = itemByCode.get(r.childErpCode);
        lines.push([r.parentErpCode, p?.itemName || "", p?.processType || "", r.childErpCode, c?.itemName || "", c?.processType || "", r.quantity, r.unit, r.confirmed ? "TRUE" : "FALSE", r.notes].map(csvEscape).join(","));
      }
      return "﻿" + lines.join("\r\n");
    }
    function reviewCsv(issues){
      const header = ["status","severity","title","description","parent_erp_code","child_erp_code","notes"];
      const lines = [header.join(",")];
      for(const i of issues){
        const rel = i.rel ? state.relations.find(r => r.id === i.rel) : null;
        const sev = i.sev === "error" ? "error" : "warning";
        lines.push(["OPEN", sev, i.title, i.desc, i.parent || "", i.child || "", rel?.notes || ""].map(csvEscape).join(","));
      }
      return "﻿" + lines.join("\r\n");
    }
    function download(name, text, type){
      const blob = new Blob([text], {type: type || "text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }
    function stamp(){return new Date().toISOString().slice(0,19).replace(/[T:]/g, "-");}

    function markComplete(){
      const issues = buildIssues();
      const myErrors = issues.filter(i => i.parent === state.selectedParent && i.sev === "error");
      if(myErrors.length){ toast("빨간 항목을 먼저 고쳐주세요", "error"); return; }
      if(!state.completedParents.includes(state.selectedParent)){
        state.completedParents.push(state.selectedParent);
      }
      saveDraft();
      toast("이 BOM 완료 처리했어요 ✓", "ok");
      setTimeout(() => { state.selectedParent = ""; state.activeTab = "done"; go("main"); }, 900);
    }

    function downloadAllCompleted(){
      if(!state.completedParents.length){ toast("완료된 BOM이 없어요", "warn"); return; }
      const allRels = state.relations.filter(r => state.completedParents.includes(r.parentErpCode));
      const allIssues = buildIssues().filter(i => state.completedParents.includes(i.parent));
      const ts = stamp();
      download(`bom_final_${ts}.csv`, relationCsv(allRels), "text/csv;charset=utf-8");
      download(`bom_review_${ts}.csv`, reviewCsv(allIssues), "text/csv;charset=utf-8");
      toast(`완료된 BOM ${state.completedParents.length}건 다운로드 완료 ✓`, "ok");
    }

    function saveJsonFile(){
      const issues = buildIssues();
      const payload = {
        tool: "BOM Planner",
        version: "1.0",
        catalog: CATALOG,
        createdAt: new Date().toISOString(),
        selectedDept: state.selectedDept,
        selectedParent: state.selectedParent,
        relations: state.relations,
        completedParents: state.completedParents,
        validationSummary: {
          errors: issues.filter(i => i.sev === "error").length,
          warnings: issues.filter(i => i.sev === "warn").length
        }
      };
      download(`bom_draft_${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      toast("작업파일 저장했어요 (.json)", "ok");
    }

    function loadJsonFile(text){
      try{
        const d = JSON.parse(text.replace(/^﻿/, ""));
        if(!Array.isArray(d.relations)) throw new Error("작업파일 형식이 아니에요");
        if(d.catalog?.checksum && d.catalog.checksum !== CATALOG.checksum){
          if(!confirm("품목 원장 버전이 달라요. 그래도 불러올까요?")) return;
        }
        if(d.selectedDept && DEPARTMENTS.find(x => x.code === d.selectedDept)) state.selectedDept = d.selectedDept;
        if(d.selectedParent && itemByCode.has(d.selectedParent)) state.selectedParent = d.selectedParent;
        state.relations = d.relations.filter(r => itemByCode.has(r.parentErpCode) && itemByCode.has(r.childErpCode));
        state.completedParents = Array.isArray(d.completedParents) ? d.completedParents.filter(c => itemByCode.has(c)) : [];
        saveDraft();
        toast(`작업파일을 불러왔어요 (${state.relations.length}건, 완료 ${state.completedParents.length}건)`, "ok");
        go("main");
      }catch(e){
        toast("불러오기 실패: " + e.message, "error");
      }
    }

    document.getElementById("jsonFileInput").addEventListener("change", e => {
      const file = e.target.files?.[0]; if(!file) return;
      const r = new FileReader();
      r.onload = () => loadJsonFile(String(r.result || ""));
      r.readAsText(file, "utf-8");
      e.target.value = "";
    });

    window.addEventListener("keydown", e => {
      if(e.key === "Escape"){
        if(state.view === "edit") go("parent");
        else if(state.view === "parent") go("main");
        else if(state.view === "review") go("edit");
      }
    });

    loadDraft();
    state.view = "main";
    render();
  </script>
</body>
</html>"""


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
    return (
        APP_TEMPLATE
        .replace("__ITEMS_JSON__", items_json)
        .replace("__META_JSON__", meta_json)
        .replace("__PROCESS_JSON__", process_json)
    )


GUIDE_TEMPLATE = r"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOM 작업 사용안내</title>
<style>
body{font:16px/1.65 "Malgun Gothic","Apple SD Gothic Neo","Segoe UI",Arial,sans-serif;margin:0;background:#f5f7fa;color:#1f252c}
main{max-width:760px;margin:0 auto;padding:32px 24px 64px}
h1{font-size:30px;margin:0 0 8px;letter-spacing:-.5px}
.lead{color:#687380;font-size:16px;margin-bottom:24px}
.step{background:#fff;border:1px solid #e4e8ec;border-radius:18px;padding:22px 26px;margin:14px 0;box-shadow:0 1px 2px rgba(20,31,43,.05)}
.step h2{margin:0 0 10px;font-size:19px;display:flex;align-items:center;gap:10px}
.step .num{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#e1f3f2;color:#0d5e62;font-weight:700;font-size:15px}
.step ul,.step ol{margin:6px 0;padding-left:22px}
.step li{margin:6px 0}
.step strong{color:#0d5e62}
code{background:#eef3f5;padding:2px 7px;border-radius:6px;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace}
.tip{background:#ecfdf5;border:1px solid #86efac;color:#166534;padding:14px 18px;border-radius:14px;margin:14px 0;font-size:15px}
.note{background:#fef3c7;border:1px solid #fcd34d;color:#854d0e;padding:14px 18px;border-radius:14px;margin:14px 0;font-size:15px}
.foot{color:#94a3b8;font-size:13px;text-align:center;padding:24px}
</style></head>
<body><main>
<h1>BOM 작업 사용안내</h1>
<div class="lead">컴퓨터에 익숙하지 않아도, 화면 안내대로 따라가면 끝납니다.</div>

<div class="step">
  <h2><span class="num">1</span>처음 화면 (탭 3개)</h2>
  <ul>
    <li><code>bom_planner.html</code>을 더블클릭해 엽니다.</li>
    <li>위쪽에 탭이 3개 있어요:
      <ul>
        <li><strong>📂 작업하기</strong> — 부서를 골라 새로 BOM 만들기</li>
        <li><strong>✓ 완료한 BOM</strong> — 끝낸 것 모아보기 + 한꺼번에 다운로드</li>
        <li><strong>⏳ 아직 안 한 것</strong> — 미처리 상위 품목 한눈에 보기</li>
      </ul>
    </li>
  </ul>
</div>

<div class="step">
  <h2><span class="num">2</span>부서 고르기</h2>
  <ul>
    <li>「작업하기」 탭에서 자기 <strong>부서</strong>를 한 번 누릅니다 (튜브 / 고압 / 진공 / 튜닝 / 조립 / 출하).</li>
    <li>그 부서가 만드는 상위 품목 목록으로 넘어갑니다.</li>
  </ul>
</div>

<div class="step">
  <h2><span class="num">3</span>상위 품목 고르기</h2>
  <ul>
    <li>위 검색창에 <strong>품명이나 코드</strong>를 적으면 바로 걸러집니다.</li>
    <li>BOM을 만들 품목을 한 번 누릅니다.</li>
    <li>오른쪽에 <strong>「아직 안 함 / 작업 중 / 끝남」</strong> 표시가 있어 진행 상태를 알 수 있어요.</li>
  </ul>
</div>

<div class="step">
  <h2><span class="num">4</span>하위 부품 추가</h2>
  <ul>
    <li>오른쪽 부품 목록에서 <strong>한 번 누르면 즉시 추가</strong>됩니다 (수량 1, 단위 EA 기본).</li>
    <li><strong>추천 / 이전공정 F / 전체</strong> 필터로 후보를 좁힐 수 있습니다. 이전 공정의 F 품목은 다음 공정 A/F 작업에 추천으로 뜹니다.</li>
    <li><strong>부서 / 단계</strong> 필터를 같이 쓰면 긴 목록에서도 필요한 부품만 빠르게 찾을 수 있습니다.</li>
    <li>왼쪽에 들어간 부품의 수량은 <strong>＋ / − 버튼</strong>으로 조정합니다.</li>
    <li><strong>「검수 끝남」</strong> 스위치를 켜면 그 줄이 검토 완료로 표시됩니다.</li>
    <li>왼쪽 위의 <strong>모두 검수 / 검수 해제 / 현재 BOM CSV</strong> 버튼으로 반복 작업을 줄일 수 있습니다.</li>
    <li>비고를 적으려면 줄 오른쪽의 <strong>✎ 아이콘</strong>을 누르세요.</li>
    <li>잘못 넣었다면 <strong>× 아이콘</strong>으로 뺄 수 있고, 바로 직전 삭제는 <strong>삭제 취소</strong>로 되돌릴 수 있어요.</li>
  </ul>
  <div class="tip">💡 <strong>팁</strong> — 작업은 자동 저장됩니다. 브라우저를 닫았다 켜도 그대로 이어집니다.</div>
</div>

<div class="step">
  <h2><span class="num">5</span>검토 + 완료 처리</h2>
  <ul>
    <li>아래쪽 <strong>「다음: 검토하기 →」</strong> 버튼을 누릅니다.</li>
    <li>요약 카드에서 <strong>「잘된 점」</strong>과 <strong>「고쳐야 할 곳 / 확인할 곳」</strong>을 한눈에 봅니다.</li>
    <li>빨간 항목이 있으면 「← 더 작업하기」로 돌아가 고칩니다.</li>
    <li>이상 없으면 <strong>「✓ 이 BOM 완료 처리」</strong>를 누릅니다 — 이 BOM이 「완료한 BOM」 탭으로 모입니다. <strong>이 시점에는 파일이 만들어지지 않습니다.</strong></li>
  </ul>
</div>

<div class="step">
  <h2><span class="num">6</span>전체 다운로드 (작업이 다 끝난 뒤)</h2>
  <ul>
    <li>「✓ 완료한 BOM」 탭으로 이동합니다.</li>
    <li>위쪽 <strong>「📥 전체 다운로드 (CSV)」</strong> 버튼을 한 번 누르면 그동안 완료한 모든 BOM이 한 번에 CSV 2개로 다운로드됩니다.
      <ul><li><code>bom_final_...csv</code>: 모든 완료 BOM 자료</li>
      <li><code>bom_review_...csv</code>: 확인이 필요했던 항목 기록</li></ul>
    </li>
    <li>잘못 완료 처리한 게 있으면 그 줄의 <strong>「완료 취소」</strong>를 누르거나, 「다시 열기」로 편집을 이어갈 수 있습니다.</li>
  </ul>
  <div class="note">⚠ 완료 처리는 빨간 항목이 모두 사라진 뒤에만 됩니다. 노란 항목은 통과해도 완료 가능합니다.</div>
</div>

<div class="step">
  <h2><span class="num">7</span>도움이 되는 단축키</h2>
  <ul>
    <li><code>Esc</code> — 한 단계 뒤로 갑니다 (편집 → 상위 → 처음 화면).</li>
    <li><code>Enter</code> — 검색창에서 첫 결과로 이동.</li>
  </ul>
</div>

<div class="step">
  <h2><span class="num">?</span>자주 보이는 메시지</h2>
  <ul>
    <li><strong>"공정 순서가 어색해요"</strong> — 부품의 공정 단계가 상위와 비슷하거나 더 늦어 보일 때 뜹니다. 정말 맞다면 비고에 이유를 적어주세요.</li>
    <li><strong>"같은 부품이 두 번 들어가 있어요"</strong> — 같은 부품이 중복 추가됐어요. 한 줄만 남기고 나머지는 × 로 빼주세요.</li>
    <li><strong>"부품끼리 서로의 하위가 되어 있어요"</strong> — A→B→A 처럼 빙글 도는 관계입니다. 한쪽을 빼야 합니다.</li>
  </ul>
</div>

<div class="foot">생성: __GENERATED_AT__ · 원장 __CHECKSUM__</div>
</main></body></html>"""


def guide_html(generated_at: str, checksum: str) -> str:
    return GUIDE_TEMPLATE.replace("__GENERATED_AT__", generated_at).replace("__CHECKSUM__", checksum)


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
