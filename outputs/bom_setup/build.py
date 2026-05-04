import json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/ERP/outputs/bom_planner/items_compact.json', 'r', encoding='utf-8') as f:
    items_json = f.read()

html = '''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOM 세팅 도구 — DEXCOWIN MES</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --c-bg: #eff4fb; --c-s1: rgba(255,255,255,0.92); --c-s2: rgba(244,247,252,0.96);
      --c-border: rgba(0,0,0,0.07); --c-blue: #2f74e7; --c-green: #179f72;
      --c-red: #d95a5a; --c-yellow: #b98619; --c-text: #101a2b;
      --c-muted: #8a96a6; --c-muted2: #56657e;
    }
    html, body { height: 100%; font-family: Pretendard, "Noto Sans KR", system-ui, sans-serif;
      font-size: 14px; background: var(--c-bg); color: var(--c-text); line-height: 1.5;
      -webkit-font-smoothing: antialiased; }
    button { cursor: pointer; border: none; outline: none; background: none; font-family: inherit; font-size: inherit; }
    input { font-family: inherit; font-size: inherit; }
    input:focus { outline: none; }
    #app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .content-area { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .app-bar { height: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; background: var(--c-s1); border-bottom: 1px solid var(--c-border); }
    .panel { background: var(--c-s2); border: 1px solid var(--c-border); border-radius: 28px; overflow: hidden; }
    .panel-header { padding: 12px 20px; border-bottom: 1px solid var(--c-border); flex-shrink: 0; }
    .panel-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: var(--c-muted2); }
    .panel-sub { font-size: 11px; color: var(--c-muted2); margin-top: 2px; }
    .input { width: 100%; background: var(--c-s1); border: 1px solid var(--c-border); border-radius: 12px;
      padding: 7px 12px; font-size: 13px; color: var(--c-text); transition: border-color 120ms; }
    .input:focus { border-color: var(--c-blue); }
    .input::placeholder { color: var(--c-muted); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 10px; padding: 7px 14px; font-size: 13px; font-weight: 600;
      transition: opacity 120ms; white-space: nowrap; }
    .btn:disabled { opacity: 0.45; cursor: default; }
    .btn-primary { background: var(--c-blue); color: #fff; }
    .btn-primary:hover:not(:disabled) { opacity: 0.88; }
    .btn-success { background: var(--c-green); color: #fff; }
    .btn-success:hover:not(:disabled) { opacity: 0.88; }
    .btn-ghost { background: transparent; color: var(--c-muted2); }
    .btn-ghost:hover { background: rgba(0,0,0,0.05); }
    .btn-outline { background: var(--c-s1); border: 1px solid var(--c-border); color: var(--c-muted2); }
    .btn-outline:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 10px;
      font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid var(--c-border);
      background: var(--c-s1); color: var(--c-muted2); transition: all 120ms; }
    .chip.active { background: var(--c-blue); color: #fff; border-color: var(--c-blue); }
    .dept-tabs { display: flex; gap: 4px; padding: 10px 16px; flex-shrink: 0; }
    .dept-tab { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 10px;
      font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--c-border);
      background: var(--c-s1); color: var(--c-muted2); transition: all 120ms; }
    .dept-tab.active { color: #fff; border-color: transparent; }
    .dept-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .status-tab { padding: 9px 16px; font-size: 12px; font-weight: 600; cursor: pointer;
      color: var(--c-muted2); border-bottom: 2px solid transparent; transition: all 120ms; }
    .status-tab.active { color: var(--c-blue); border-bottom-color: var(--c-blue); }
    .pt-badge { display: inline-flex; align-items: center; justify-content: center;
      border-radius: 4px; padding: 2px 5px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .item-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer;
      transition: background 100ms; border-bottom: 1px solid var(--c-border); }
    .item-row:last-child { border-bottom: none; }
    .item-row:hover { background: rgba(47,116,231,0.04); }
    .item-name { font-size: 13px; font-weight: 500; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-code { font-size: 11px; color: var(--c-muted2); margin-top: 1px; }
    .bom-grid-header { display: grid; grid-template-columns: 40px 1fr 108px 110px 72px 36px;
      align-items: center; padding: 8px 20px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.15em; color: var(--c-muted2);
      border-bottom: 1px solid var(--c-border); flex-shrink: 0; }
    .bom-grid-row { display: grid; grid-template-columns: 40px 1fr 108px 110px 72px 36px;
      align-items: center; padding: 9px 20px; border-bottom: 1px solid var(--c-border); transition: background 100ms; }
    .bom-grid-row:last-child { border-bottom: none; }
    .bom-grid-row:hover { background: rgba(0,0,0,0.02); }
    .tag { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px;
      font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .tag-success { background: rgba(23,159,114,0.12); color: var(--c-green); }
    .tag-error   { background: rgba(217,90,90,0.12); color: var(--c-red); }
    .tag-warn    { background: rgba(185,134,25,0.12); color: var(--c-yellow); }
    .tag-info    { background: rgba(47,116,231,0.12); color: var(--c-blue); }
    .tag-muted   { background: rgba(0,0,0,0.06); color: var(--c-muted2); }
    .issue-card { display: flex; gap: 10px; align-items: flex-start;
      padding: 10px 14px; border-radius: 10px; margin-bottom: 8px; }
    .issue-error { background: rgba(217,90,90,0.07); border: 1px solid rgba(217,90,90,0.18); }
    .issue-warn  { background: rgba(185,134,25,0.07); border: 1px solid rgba(185,134,25,0.15); }
    .issue-ok    { background: rgba(23,159,114,0.07); border: 1px solid rgba(23,159,114,0.18); }
    #toast-root { position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
    .toast { background: var(--c-text); color: #fff; padding: 10px 16px; border-radius: 12px;
      font-size: 13px; font-weight: 500; box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      animation: toast-in 200ms ease; }
    .toast-success { background: var(--c-green); }
    .toast-error   { background: var(--c-red); }
    .toast-warning { background: var(--c-yellow); }
    @keyframes toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 32px; gap: 6px; color: var(--c-muted2); font-size: 13px; text-align: center; flex: 1; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 99px; }
  </style>
</head>
<body>
<div id="app"></div>
<div id="toast-root"></div>
<input type="file" id="import-input" accept=".json" style="display:none" onchange="handleImportFile(this)">
<script>
const ITEMS = ITEMS_PLACEHOLDER;

const PROC_ORDER = ["TR","TA","TF","HR","HA","HF","VR","VA","VF","NR","NA","NF","AR","AA","AF","PR","PA","PF"];
const DEPTS = [
  { id:"T", label:"튜브",  color:"#078db0" },
  { id:"H", label:"고압",  color:"#b98619" },
  { id:"V", label:"진공",  color:"#6f59e8" },
  { id:"N", label:"튜닝",  color:"#f97316" },
  { id:"A", label:"조립",  color:"#2f74e7" },
  { id:"P", label:"출하",  color:"#179f72" },
];
function deptOf(pt)    { return pt?.[0] ?? ""; }
function stageOf(pt)   { return pt?.[1] ?? ""; }
function deptIdx(pt)   { return DEPTS.findIndex(d => d.id === deptOf(pt)); }
function procIdx(pt)   { return PROC_ORDER.indexOf(pt ?? ""); }
function deptColor(pt) { return DEPTS.find(d => d.id === deptOf(pt))?.color ?? "#8a96a6"; }
function hexAlpha(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

const S = {
  view:"main", activeTab:"pending", dept:"T", parent:null,
  pending:[], completed:[],
  parentSearch:"", parentFilter:"ALL",
  childSearch:"", childFilter:"rec", childDept:"",
  childPickerOpen:true, pendingChildId:null, pendingChildQty:"1",
};

const DRAFT_KEY = "bom_setup_v1";
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({pending:S.pending,completed:S.completed})); } catch(_){}
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY)??"null");
    if (d?.pending)   S.pending   = d.pending;
    if (d?.completed) S.completed = d.completed;
  } catch(_){}
}
function exportDraft() {
  const data = {version:1, pending:S.pending, completed:S.completed, exportedAt:new Date().toISOString()};
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`bom_draft_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  toast("진행도 파일 저장됨","success");
}
function handleImportFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d?.pending) throw new Error("올바른 진행도 파일이 아닙니다");
      if (!confirm(`진행도를 불러오면 현재 작업이 덮어씌워집니다.\\n계속하시겠습니까?`)) return;
      S.pending=d.pending??[]; S.completed=d.completed??[];
      saveDraft(); render();
      toast(`진행도 불러오기 완료 (대기 ${S.pending.length}건)`,"success");
    } catch(err) { toast(err.message,"error"); }
    input.value="";
  };
  reader.readAsText(file);
}
function exportBom() {
  const allRows = S.pending.filter(r=>S.completed.includes(r.parentItemId));
  if (allRows.length===0) { toast("완료된 BOM이 없습니다","warning"); return; }
  const rows = allRows.map(r=>{
    const p=ITEMS.find(i=>i.item_id===r.parentItemId);
    const c=ITEMS.find(i=>i.item_id===r.childItemId);
    return {
      parent_erp_code:p?.erp_code??r.parentItemId, parent_item_name:p?.item_name??"",
      parent_process_type:p?.process_type_code??"",
      child_erp_code:c?.erp_code??r.childItemId, child_item_name:c?.item_name??"",
      child_process_type:c?.process_type_code??"",
      quantity:r.qty, unit:r.unit??"EA",
    };
  });
  const jsonBlob = new Blob([JSON.stringify(rows,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(jsonBlob);
  const a=document.createElement("a"); a.href=url;
  a.download=`bom_export_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  const csvHeader="parent_erp_code,parent_item_name,parent_process_type,child_erp_code,child_item_name,child_process_type,quantity,unit";
  const csvRows=rows.map(r=>[r.parent_erp_code,r.parent_item_name,r.parent_process_type,
    r.child_erp_code,r.child_item_name,r.child_process_type,r.quantity,r.unit]
    .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","));
  const csvBlob=new Blob(["﻿"+csvHeader+"\\n"+csvRows.join("\\n")],{type:"text/csv;charset=utf-8"});
  const csvUrl=URL.createObjectURL(csvBlob);
  const b=document.createElement("a"); b.href=csvUrl;
  b.download=`bom_export_${new Date().toISOString().slice(0,10)}.csv`;
  setTimeout(()=>{b.click();URL.revokeObjectURL(csvUrl);},300);
  toast(`BOM ${rows.length}건 내보내기 완료`,"success");
}

function buildIssues(rels) {
  const issues=[], keyCount={};
  for (const r of rels) { const k=`${r.parentItemId}:${r.childItemId}`; keyCount[k]=(keyCount[k]||0)+1; }
  for (const r of rels) {
    const parent=ITEMS.find(i=>i.item_id===r.parentItemId);
    const child =ITEMS.find(i=>i.item_id===r.childItemId);
    if (!parent) { issues.push({tempId:r.tempId,sev:"error",msg:"상위 품목이 원장에 없음"}); continue; }
    if (!child)  { issues.push({tempId:r.tempId,sev:"error",msg:"하위 부품이 원장에 없음"}); continue; }
    if (r.parentItemId===r.childItemId) { issues.push({tempId:r.tempId,sev:"error",msg:"자기 자신을 하위로 지정"}); continue; }
    if (!(r.qty>0)) { issues.push({tempId:r.tempId,sev:"error",msg:"수량이 0 이하"}); continue; }
    const k=`${r.parentItemId}:${r.childItemId}`;
    if (keyCount[k]>1) { issues.push({tempId:r.tempId,sev:"error",msg:"중복 관계"}); continue; }
    const pi=procIdx(parent.process_type_code), ci=procIdx(child.process_type_code);
    if (pi>=0&&ci>=0&&ci>=pi) issues.push({tempId:r.tempId,sev:"warn",
      msg:`공정 순서 역방향 (${child.process_type_code??"-"} → ${parent.process_type_code??"-"})`});
  }
  for (const cycle of findCycles(rels))
    for (const r of rels)
      if (cycle.includes(r.parentItemId)||cycle.includes(r.childItemId))
        issues.push({tempId:r.tempId,sev:"error",msg:`순환 참조: ${cycle.slice(0,3).join(" → ")}…`});
  return issues;
}
function findCycles(rels) {
  const g={};
  for (const r of rels) (g[r.parentItemId]??=[]).push(r.childItemId);
  const cycles=[], visited=new Set(), inStack=new Set(), path=[];
  function dfs(n){
    if (inStack.has(n)){ cycles.push(path.slice(path.indexOf(n))); return; }
    if (visited.has(n)) return;
    visited.add(n); inStack.add(n); path.push(n);
    for (const c of (g[n]||[])) dfs(c);
    path.pop(); inStack.delete(n);
  }
  for (const k of Object.keys(g)) dfs(k);
  return cycles;
}

function scoreCand(childPt,parentPt) {
  const pi=procIdx(parentPt),ci=procIdx(childPt),pd=deptIdx(parentPt),cd=deptIdx(childPt);
  if (pi<0||ci<0) return 10;
  if (stageOf(childPt)==="F"&&cd===pd-1) return 120;
  if (ci<pi&&cd===pd) return 85;
  if (ci<pi) return 70;
  if (ci===pi) return 20;
  return 5;
}
function getCandidates(parent) {
  if (!parent) return [];
  const alreadySet=new Set(S.pending.filter(r=>r.parentItemId===parent.item_id).map(r=>r.childItemId));
  let cands=ITEMS.filter(i=>i.item_id!==parent.item_id)
    .map(i=>({...i,score:scoreCand(i.process_type_code,parent.process_type_code),alreadyIn:alreadySet.has(i.item_id)}));
  if (S.childFilter==="rec")   cands=cands.filter(i=>i.score>=70||i.alreadyIn);
  if (S.childFilter==="prevF") cands=cands.filter(i=>stageOf(i.process_type_code)==="F"&&deptIdx(i.process_type_code)===deptIdx(parent.process_type_code)-1);
  if (S.childDept) cands=cands.filter(i=>deptOf(i.process_type_code)===S.childDept);
  if (S.childSearch.trim()) {
    const q=S.childSearch.trim().toLowerCase();
    cands=cands.filter(i=>i.item_name?.toLowerCase().includes(q)||i.erp_code?.toLowerCase().includes(q));
  }
  cands.sort((a,b)=>a.alreadyIn!==b.alreadyIn?a.alreadyIn?1:-1:b.score-a.score);
  return cands.slice(0,200);
}

let _uid=0; const uid=()=>"t"+(++_uid);
function esc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function ptBadge(pt){const c=deptColor(pt),bg=hexAlpha(c,0.12);return `<span class="pt-badge" style="background:${bg};color:${c}">${esc(pt||"–")}</span>`;}
function toast(msg,type="info"){
  const el=document.createElement("div");
  el.className=`toast${type==="success"?" toast-success":type==="error"?" toast-error":type==="warning"?" toast-warning":""}`;
  el.textContent=msg; document.getElementById("toast-root").appendChild(el);
  setTimeout(()=>el.remove(),2800);
}

function renderMain() {
  const deptInfo=DEPTS.find(d=>d.id===S.dept);
  const deptItems=ITEMS.filter(i=>deptOf(i.process_type_code)===S.dept);
  let list=deptItems;
  if (S.parentFilter!=="ALL") list=list.filter(i=>stageOf(i.process_type_code)===S.parentFilter);
  if (S.parentSearch.trim()){const q=S.parentSearch.trim().toLowerCase();list=list.filter(i=>i.item_name?.toLowerCase().includes(q)||i.erp_code?.toLowerCase().includes(q));}
  const compSet=new Set(S.completed);
  const workList=list.filter(i=>!compSet.has(i.item_id)&&S.pending.some(r=>r.parentItemId===i.item_id));
  const doneList=list.filter(i=>compSet.has(i.item_id));
  const pendingList=list.filter(i=>!compSet.has(i.item_id)&&!S.pending.some(r=>r.parentItemId===i.item_id));
  const tabList=S.activeTab==="work"?workList:S.activeTab==="done"?doneList:pendingList;
  const stats=[
    {label:"전체",val:deptItems.length,color:"#2f74e7"},
    {label:"완료",val:deptItems.filter(i=>compSet.has(i.item_id)).length,color:"#179f72"},
    {label:"작업 중",val:deptItems.filter(i=>!compSet.has(i.item_id)&&S.pending.some(r=>r.parentItemId===i.item_id)).length,color:"#f97316"},
    {label:"미착수",val:deptItems.filter(i=>!compSet.has(i.item_id)&&!S.pending.some(r=>r.parentItemId===i.item_id)).length,color:"#8a96a6"},
  ];
  const FILTERS=[{id:"ALL",label:"전체"},{id:"F",label:"완성품"},{id:"A",label:"중간공정"},{id:"R",label:"원자재"}];
  function itemRow(item){
    const done=compSet.has(item.item_id);
    const cnt=S.pending.filter(r=>r.parentItemId===item.item_id).length;
    return `<div class="item-row" onclick="enterEdit('${item.item_id}')">
      ${ptBadge(item.process_type_code)}
      <div style="flex:1;min-width:0;"><div class="item-name">${esc(item.item_name)}</div><div class="item-code">${esc(item.erp_code??"")}</div></div>
      ${done?`<span class="tag tag-success">완료</span>`:cnt>0?`<span class="tag tag-info">+${cnt} 대기</span>`:`<span class="tag tag-muted">미착수</span>`}
    </div>`;
  }
  return `
<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div class="dept-tabs">
    ${DEPTS.map(d=>`<button class="dept-tab${d.id===S.dept?" active":""}" style="${d.id===S.dept?`background:${d.color};`:""}" onclick="selDept('${d.id}')"><span class="dept-dot" style="background:${d.id===S.dept?"rgba(255,255,255,0.6)":d.color}"></span>${esc(d.label)}</button>`).join("")}
  </div>
  <div style="flex:1;min-height:0;display:flex;gap:12px;padding:0 16px 16px;">
    <div class="panel" style="width:320px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;">
      <div class="panel-header"><div class="panel-label">상위 품목 선택</div><div class="panel-sub">${esc(deptInfo?.label??"")} · ${list.length} / ${deptItems.length}건 표시</div></div>
      <div style="padding:10px 12px 8px;flex-shrink:0;">
        <input class="input" placeholder="품목명 / 코드 검색" value="${esc(S.parentSearch)}" oninput="S.parentSearch=this.value;render()" style="margin-bottom:8px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${FILTERS.map(f=>`<button class="chip${S.parentFilter===f.id?" active":""}" onclick="S.parentFilter='${f.id}';render()">${esc(f.label)}</button>`).join("")}</div>
      </div>
      <div style="overflow-y:auto;flex:1;min-height:0;">${list.length===0?`<div class="empty-state"><span>결과 없음</span></div>`:list.map(itemRow).join("")}</div>
    </div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;gap:10px;flex-shrink:0;">${stats.map(s=>`<div class="panel" style="flex:1;padding:14px 18px;"><div class="panel-label">${esc(s.label)}</div><div style="font-size:28px;font-weight:700;color:${s.color};margin-top:4px;line-height:1.1;">${s.val}</div></div>`).join("")}</div>
      <div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div style="display:flex;border-bottom:1px solid var(--c-border);padding:0 16px;flex-shrink:0;">
          ${[{id:"pending",label:"미착수",cnt:pendingList.length},{id:"work",label:"작업 중",cnt:workList.length},{id:"done",label:"완료",cnt:doneList.length}].map(t=>`
            <button class="status-tab${S.activeTab===t.id?" active":""}" onclick="S.activeTab='${t.id}';render()">
              ${esc(t.label)}<span style="margin-left:4px;padding:1px 6px;border-radius:99px;font-size:11px;font-weight:700;background:${t.cnt>0?"rgba(47,116,231,0.1)":"rgba(0,0,0,0.05)"};color:${t.cnt>0?"var(--c-blue)":"var(--c-muted)"};">${t.cnt}</span>
            </button>`).join("")}
        </div>
        <div style="overflow-y:auto;flex:1;min-height:0;">${tabList.length===0?`<div class="empty-state"><span style="font-weight:600;">${S.activeTab==="work"?"작업 중인 BOM 없음":S.activeTab==="done"?"완료된 BOM 없음":"미착수 항목 없음"}</span>${S.activeTab==="pending"?`<span style="font-size:12px;">좌측에서 품목을 선택하면 BOM 작성을 시작합니다</span>`:""}</div>`:tabList.map(itemRow).join("")}</div>
      </div>
    </div>
  </div>
</div>`;
}

function renderEdit() {
  const parent=S.parent;
  if (!parent) return `<div class="empty-state">상위 품목을 선택해주세요.</div>`;
  const myRows=S.pending.filter(r=>r.parentItemId===parent.item_id);
  const cands=getCandidates(parent);
  const pw=S.childPickerOpen?430:0;
  function bomRow(row){
    const ci=ITEMS.find(i=>i.item_id===row.childItemId)??{};
    const qty=Number(row.qty),unit=row.unit||"EA",stock=Number(ci.quantity??0);
    return `<div class="bom-grid-row">${ptBadge(ci.process_type_code)}<div class="truncate" style="font-size:13px;">${esc(ci.item_name??"")}</div><div style="text-align:right;font-size:11px;color:var(--c-muted2);">${esc(ci.erp_code??"")}</div><div style="text-align:right;font-size:13px;"><button onclick="editQty('${row.tempId}')" style="font-size:12px;color:var(--c-text);padding:2px 8px;border-radius:6px;background:var(--c-s1);border:1px solid var(--c-border);">×${qty} ${unit}</button></div><div style="text-align:right;font-size:11px;color:var(--c-muted2);">${stock>0?stock.toFixed(0):"–"}</div><div style="display:flex;align-items:center;justify-content:center;"><button onclick="removePending('${row.tempId}')" style="color:var(--c-red);padding:3px 6px;border-radius:6px;font-size:12px;background:rgba(217,90,90,0.08);" title="제거">✕</button></div></div>`;
  }
  function candRow(item){
    const isPending=S.pendingChildId===item.item_id;
    return `<div style="border-bottom:1px solid var(--c-border);"><button onclick="${item.alreadyIn?"":``+`selChild('${item.item_id}')`}" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;text-align:left;background:${isPending?"rgba(47,116,231,0.06)":"transparent"};opacity:${item.alreadyIn?0.45:1};cursor:${item.alreadyIn?"default":"pointer"};">${ptBadge(item.process_type_code)}<div style="flex:1;min-width:0;"><div class="truncate" style="font-size:13px;">${esc(item.item_name)}</div><div style="font-size:11px;color:var(--c-muted2);">${esc(item.erp_code??"")}</div></div>${item.alreadyIn?`<span class="tag tag-success">추가됨</span>`:item.score>=70?`<span class="tag tag-info" style="font-size:10px;">${item.score}pt</span>`:""}</button>${isPending&&!item.alreadyIn?`<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(47,116,231,0.04);"><span style="font-size:12px;color:var(--c-muted2);">소요량</span><input id="qin-${item.item_id}" type="number" min="0.001" step="1" value="${esc(S.pendingChildQty)}" oninput="S.pendingChildQty=this.value" onkeydown="if(event.key==='Enter')addChild('${item.item_id}')" style="width:72px;text-align:right;background:var(--c-s1);border:1px solid var(--c-blue);border-radius:10px;padding:5px 8px;font-size:13px;"><span style="font-size:12px;color:var(--c-muted2);">EA</span><button class="btn btn-primary" style="font-size:12px;padding:5px 12px;margin-left:auto;" onclick="addChild('${item.item_id}')">추가</button><button class="btn btn-ghost" style="font-size:12px;" onclick="S.pendingChildId=null;render()">취소</button></div>`:""}</div>`;
  }
  return `
<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;flex-shrink:0;border-bottom:1px solid var(--c-border);background:var(--c-s1);">
    <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="backToMain()">← 목록</button>
    <span style="color:var(--c-muted);font-size:12px;">›</span>
    ${ptBadge(parent.process_type_code)}
    <span class="truncate" style="font-size:13px;font-weight:600;max-width:320px;">${esc(parent.item_name)}</span>
    <span style="font-size:12px;color:var(--c-muted2);flex-shrink:0;">${esc(parent.erp_code??"")}</span>
    <div style="flex:1;"></div>
    <button class="btn btn-primary" style="font-size:12px;" onclick="goReview()">검토 · 완료 →</button>
  </div>
  <div style="flex:1;min-height:0;display:flex;gap:12px;padding:12px 16px 16px;">
    <div class="panel" style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;">
      <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div><div class="panel-label">현재 구성 목록</div><div class="panel-sub">${myRows.length}건</div></div>
        <button class="btn${S.childPickerOpen?" btn-outline":" btn-primary"}" style="font-size:12px;padding:6px 12px;" onclick="S.childPickerOpen=!S.childPickerOpen;render()">${S.childPickerOpen?"◀ 닫기":"+ 하위 품목 추가"}</button>
      </div>
      ${myRows.length===0?`<div class="empty-state"><span style="font-weight:600;">등록된 BOM 항목이 없습니다</span><span style="font-size:12px;">우측 패널에서 하위 품목을 추가하세요.</span></div>`:`<div class="bom-grid-header"><span>구분</span><span>자재명</span><span style="text-align:right;">코드</span><span style="text-align:right;">소요량</span><span style="text-align:right;">재고</span><span></span></div><div style="overflow-y:auto;flex:1;min-height:0;">${myRows.map(r=>bomRow(r)).join("")}</div>`}
    </div>
    <div style="flex-shrink:0;min-height:0;overflow:hidden;width:${pw}px;transition:width 160ms cubic-bezier(0.4,0,0.2,1);">
      <div style="width:430px;height:100%;opacity:${S.childPickerOpen?1:0};transform:${S.childPickerOpen?"translateX(0)":"translateX(18px)"};transition:opacity 260ms ease,transform 260ms ease;will-change:transform,opacity;">
        <div class="panel" style="height:100%;display:flex;flex-direction:column;">
          <div class="panel-header" style="flex-shrink:0;"><div class="panel-label">하위 품목 추가</div><div class="panel-sub">${cands.filter(c=>!c.alreadyIn).length}개 후보</div></div>
          <div style="padding:8px 12px;flex-shrink:0;">
            <input class="input" placeholder="품목명 / 코드 검색" value="${esc(S.childSearch)}" oninput="S.childSearch=this.value;render()" style="margin-bottom:8px;">
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">${[{id:"rec",label:"추천"},{id:"prevF",label:"이전공정 F"},{id:"all",label:"전체"}].map(f=>`<button class="chip${S.childFilter===f.id?" active":""}" onclick="S.childFilter='${f.id}';render()">${esc(f.label)}</button>`).join("")}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${DEPTS.map(d=>`<button class="chip${S.childDept===d.id?" active":""}" style="${S.childDept===d.id?`background:${d.color};border-color:${d.color};`:""}" onclick="togChildDept('${d.id}')">${d.id}</button>`).join("")}</div>
          </div>
          <div style="overflow-y:auto;flex:1;min-height:0;border-top:1px solid var(--c-border);">${cands.length===0?`<div class="empty-state"><span>결과 없음</span></div>`:cands.map(candRow).join("")}</div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function renderReview() {
  const parent=S.parent; if (!parent) return "";
  const myRows=S.pending.filter(r=>r.parentItemId===parent.item_id);
  const issues=buildIssues(myRows);
  const errors=issues.filter(i=>i.sev==="error"),warns=issues.filter(i=>i.sev==="warn");
  const canSave=errors.length===0&&myRows.length>0;
  return `
<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;flex-shrink:0;border-bottom:1px solid var(--c-border);background:var(--c-s1);">
    <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="backToEdit()">← 편집으로</button>
    <span style="color:var(--c-muted);font-size:12px;">›</span>
    ${ptBadge(parent.process_type_code)}
    <span class="truncate" style="font-size:13px;font-weight:600;max-width:300px;">${esc(parent.item_name)}</span>
    <div style="flex:1;"></div>
    <button class="btn${canSave?" btn-success":" btn-outline"}" ${!canSave?"disabled":""} onclick="${canSave?"markDone()":""}">완료로 표시</button>
  </div>
  <div style="overflow-y:auto;flex:1;padding:16px;">
    <div style="margin-bottom:16px;">
      <div class="panel-label" style="margin-bottom:8px;">검증 결과</div>
      ${errors.length===0&&warns.length===0&&myRows.length>0?`<div class="issue-card issue-ok"><span style="color:var(--c-green);font-weight:700;flex-shrink:0;">정상</span><span style="font-size:13px;">검증 이슈 없음. 완료로 표시할 수 있습니다.</span></div>`:""}
      ${errors.map(i=>`<div class="issue-card issue-error"><span style="color:var(--c-red);font-weight:700;flex-shrink:0;">오류</span><span style="font-size:13px;">${esc(i.msg)}</span></div>`).join("")}
      ${warns.map(i=>`<div class="issue-card issue-warn"><span style="color:var(--c-yellow);font-weight:700;flex-shrink:0;">경고</span><span style="font-size:13px;">${esc(i.msg)}</span></div>`).join("")}
    </div>
    <div class="panel-label" style="margin-bottom:8px;">저장 대상 (${myRows.length}건)</div>
    ${myRows.length===0?`<div class="panel" style="padding:20px;text-align:center;font-size:13px;color:var(--c-muted2);">추가된 항목이 없습니다.</div>`:`<div class="panel"><div class="bom-grid-header"><span>구분</span><span>자재명</span><span style="text-align:right;">코드</span><span style="text-align:right;">소요량</span><span style="text-align:right;">재고</span><span style="text-align:center;">검증</span></div>${myRows.map(r=>{const child=ITEMS.find(i=>i.item_id===r.childItemId)??{};const hasErr=issues.some(i=>i.tempId===r.tempId);return `<div class="bom-grid-row" style="${hasErr?"background:rgba(217,90,90,0.04);":""}">${ptBadge(child.process_type_code)}<div class="truncate" style="font-size:13px;">${esc(child.item_name??r.childItemId)}</div><div style="text-align:right;font-size:11px;color:var(--c-muted2);">${esc(child.erp_code??"")}</div><div style="text-align:right;font-size:13px;">×${Number(r.qty)} ${r.unit||"EA"}</div><div style="text-align:right;font-size:11px;color:var(--c-muted2);">${Number(child.quantity??0)>0?Number(child.quantity).toFixed(0):"–"}</div><div style="text-align:center;font-size:12px;color:${hasErr?"var(--c-red)":"var(--c-green)"}">${hasErr?"⚠":"✓"}</div></div>`;}).join("")}</div>`}
  </div>
</div>`;
}

function render() {
  const totalPending=S.pending.filter(r=>!S.completed.includes(r.parentItemId)).length;
  const totalDone=S.completed.length;
  let body=S.view==="edit"?renderEdit():S.view==="review"?renderReview():renderMain();
  document.getElementById("app").innerHTML=`
    <div class="app-bar">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;letter-spacing:0.05em;color:var(--c-blue);">DEXCOWIN MES</span>
        <span style="color:var(--c-muted);font-size:13px;">›</span>
        <span style="font-size:13px;font-weight:600;">BOM 세팅 도구</span>
        <span style="font-size:11px;color:var(--c-muted);">${ITEMS.length}개 품목</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${totalPending>0?`<span class="tag tag-info">${totalPending}건 미완료</span>`:""}
        ${totalDone>0?`<span class="tag tag-success">${totalDone}개 완료</span>`:""}
        <button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="document.getElementById('import-input').click()">진행도 불러오기</button>
        <button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="exportDraft()">진행도 저장</button>
        ${totalDone>0?`<button class="btn btn-success" style="font-size:12px;padding:5px 12px;" onclick="exportBom()">BOM 내보내기</button>`:""}
      </div>
    </div>
    <div class="content-area">${body}</div>`;
}

function selDept(id){S.dept=id;S.parentSearch="";S.parentFilter="ALL";render();}
function enterEdit(itemId){
  const item=ITEMS.find(i=>i.item_id===itemId); if (!item) return;
  S.parent=item;S.view="edit";S.pendingChildId=null;S.pendingChildQty="1";
  S.childSearch="";S.childFilter="rec";S.childDept="";S.childPickerOpen=true;render();
}
function backToMain(){S.view="main";S.parent=null;render();}
function backToEdit(){S.view="edit";render();}
function goReview(){S.view="review";render();}
function selChild(itemId){
  if (S.pendingChildId===itemId){S.pendingChildId=null;render();return;}
  S.pendingChildId=itemId;S.pendingChildQty="1";render();
  setTimeout(()=>{const el=document.getElementById(`qin-${itemId}`);if(el)el.focus();},40);
}
function togChildDept(id){S.childDept=S.childDept===id?"":id;render();}
function addChild(itemId){
  if (!S.parent) return;
  const qty=parseFloat(S.pendingChildQty);
  if (!(qty>0)){toast("수량을 올바르게 입력하세요","error");return;}
  const child=ITEMS.find(i=>i.item_id===itemId); if (!child) return;
  if (S.pending.some(r=>r.parentItemId===S.parent.item_id&&r.childItemId===itemId)){toast("이미 추가된 부품입니다","warning");return;}
  S.pending.push({tempId:uid(),parentItemId:S.parent.item_id,childItemId:itemId,qty,unit:"EA"});
  S.pendingChildId=null;S.pendingChildQty="1";saveDraft();render();
  toast(`${child.item_name} 추가됨`);
}
function removePending(tempId){S.pending=S.pending.filter(r=>r.tempId!==tempId);saveDraft();render();}
function editQty(tempId){
  const rel=S.pending.find(r=>r.tempId===tempId); if (!rel) return;
  const input=prompt(`소요량 (현재: ${rel.qty})`,String(rel.qty)); if (input===null) return;
  const v=parseFloat(input);
  if (isNaN(v)||v<=0){toast("올바른 수량을 입력하세요","error");return;}
  rel.qty=v;saveDraft();render();
}
function markDone(){
  const parent=S.parent; if (!parent) return;
  if (!S.completed.includes(parent.item_id)) S.completed.push(parent.item_id);
  saveDraft();
  toast(`${parent.item_name} 완료 처리됨`,"success");
  S.view="main";S.parent=null;render();
}
document.addEventListener("keydown",e=>{
  if (e.key==="Escape"){if(S.view==="review"){backToEdit();return;}if(S.view==="edit"){backToMain();return;}}
});

loadDraft();
render();
</script>
</body>
</html>'''

html = html.replace('ITEMS_PLACEHOLDER', items_json)

with open('C:/ERP/outputs/bom_setup/bom_setup.html', 'w', encoding='utf-8') as f:
    f.write(html)

size = os.path.getsize('C:/ERP/outputs/bom_setup/bom_setup.html')
print(f'Written: {size:,} bytes ({size//1024} KB)')
