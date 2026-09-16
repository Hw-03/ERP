import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const CONTRACT_PATH = path.join(REPO_ROOT, "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md");
const REVIEW_PATH = path.join(REPO_ROOT, "docs/superpowers/specs/2026-09-14-mes-functional-regression-review.html");
const CATEGORY_BY_SECTION = {
  1: "입출고", 2: "입출고", 3: "내역", 4: "출하", 5: "불량", 6: "불량", 7: "불량", 8: "불량", 9: "불량", 10: "불량",
  11: "불량", 12: "출하", 13: "불량", 14: "입출고", 15: "입출고", 16: "입출고", 17: "입출고", 18: "불량", 19: "관리자",
  20: "일일보고", 21: "주간보고", 22: "입출고", 23: "입출고", 24: "입출고", 25: "입출고",
};
const VERDICT_LABEL = { approved: "기대값 맞음", revision: "기대값 수정 필요", hold: "보류" };

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function valueFor(headers, cells, candidates) {
  const index = headers.findIndex((header) => candidates.includes(header));
  return index < 0 ? "" : (cells[index] ?? "");
}

export function parseEvidenceSections(markdown) {
  const evidence = markdown.match(/### 8\.1\s[^\n]*[\s\S]*?(?=\n## 9\.)/)?.[0] ?? "";
  return evidence.split(/(?=^### 8\.\d+\s)/m).filter(Boolean).map((chunk) => {
    const lines = chunk.trim().split(/\r?\n/);
    const heading = lines.shift().match(/^### (8\.(\d+))\s+(.+)$/);
    if (!heading) throw new Error(`실측 절 제목을 해석할 수 없습니다: ${chunk.slice(0, 40)}`);
    const [, id, number, title] = heading;
    const tableStart = lines.findIndex((line) => line.trim().startsWith("|"));
    if (tableStart < 0) throw new Error(`${id}에 검수 표가 없습니다.`);
    const headers = tableCells(lines[tableStart]);
    const rows = lines.slice(tableStart + 1)
      .filter((line) => line.trim().startsWith("|"))
      .map(tableCells)
      .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
    return {
      id,
      title,
      category: CATEGORY_BY_SECTION[Number(number)] ?? "기타",
      context: lines.slice(0, tableStart).filter((line) => line.trim()).join("\n").trim(),
      items: rows.map((cells, index) => ({
        id: `${id}-${String(index + 1).padStart(2, "0")}`,
        action: cells[0] ?? "",
        expected: valueFor(headers, cells, ["기대값 제안"]),
        actual: valueFor(headers, cells, ["확인한 현행", "실제 반응"]),
        coverage: valueFor(headers, cells, ["테스트에 포함할 내용"]),
        investigation: valueFor(headers, cells, ["확인 상태", "판정/후속"]),
      })),
    };
  });
}

function investigationKind(investigation) {
  const text = investigation.replace(/[*`]/g, "");
  if (/화면 확인|정책 결정|확인 필요|추가 실측|미실행|제출하지|경합 테스트 필요/.test(text)) return "needs-check";
  if (/불일치|오류|누락|오표시|모순|불가|실패|위험|치명|없음|문제/.test(text)) return "mismatch";
  if (/일치|정상|통과|확인/.test(text)) return "match";
  return "needs-check";
}

export function deriveTestTarget(verdict, investigation) {
  if (!verdict) return "미확인";
  if (verdict === "revision") return "기대값 수정 대기";
  if (verdict === "hold") return "판단 보류";
  const kind = investigationKind(investigation);
  return kind === "needs-check" ? "추가 실측 필요" : kind === "mismatch" ? "버그 재현 테스트" : "정상 동작 보호 테스트";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reviewToCsv(sections, reviews) {
  const rows = [["ID", "업무", "시나리오", "확인 항목", "기대 반응", "실제 반응", "기존 조사 판정", "사용자 판정", "사용자 의견", "테스트 분류"]];
  for (const section of sections) for (const item of section.items) {
    const review = reviews[item.id] ?? {};
    rows.push([item.id, section.category, `${section.id} ${section.title}`, item.action, item.expected, item.actual, item.investigation,
      VERDICT_LABEL[review.verdict] ?? "미확인", review.note ?? "", deriveTestTarget(review.verdict ?? "", item.investigation)]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function buildHtml(sections) {
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const data = JSON.stringify(sections).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEXCOWIN MES 실화면 조사 판정표</title>
<style>
:root{color-scheme:light;--bg:#eff4fb;--surface:rgba(255,255,255,.96);--soft:#f7f9fd;--text:#101a2b;--muted:#56657e;--muted2:#72829a;--line:rgba(76,97,130,.14);--blue:#2f74e7;--blue-bg:#eaf2ff;--green:#147d5c;--green-bg:#e3f7ef;--red:#b94242;--red-bg:#fdecec;--yellow:#8a6511;--yellow-bg:#fff5d8;--shadow:0 24px 64px rgba(45,70,106,.12)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.65 Pretendard,"Noto Sans KR","Segoe UI",system-ui,sans-serif}button,input,select,textarea{font:inherit}button{min-height:44px;border:0;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid rgba(47,116,231,.28);outline-offset:2px}.shell{max-width:1440px;margin:auto;padding:28px}.hero{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;margin-bottom:18px}.eyebrow{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.08em}.hero h1{margin:4px 0 6px;font-size:28px;line-height:1.25}.hero p{margin:0;color:var(--muted)}.actions,.verdicts{display:flex;gap:8px;flex-wrap:wrap}.button{padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font-weight:700;transition:.15s}.button:hover{filter:brightness(.98);transform:translateY(-1px)}.button:active{transform:scale(.98)}.button.primary{background:var(--blue);border-color:var(--blue);color:white}.file-button{display:inline-flex;align-items:center;min-height:44px}.file-button input{display:none}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}.metric{padding:14px 16px;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow)}.metric span{display:block;color:var(--muted2);font-size:12px;font-weight:700}.metric strong{display:block;font-size:24px}.metric.approved strong{color:var(--green)}.metric.revision strong{color:var(--red)}.metric.hold strong{color:var(--yellow)}.toolbar{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:minmax(220px,2fr) repeat(3,minmax(150px,1fr));gap:10px;padding:12px;margin-bottom:14px;border:1px solid var(--line);border-radius:18px;background:rgba(239,244,251,.94);backdrop-filter:blur(16px)}.field{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text)}.toolbar .actions{grid-column:1/-1}.progress{height:8px;margin-bottom:16px;overflow:hidden;border-radius:99px;background:rgba(114,130,154,.18)}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--blue),var(--green));transition:width .2s}.scenario{margin-bottom:12px;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow)}.scenario>summary{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;min-height:68px;padding:14px 18px;list-style:none;cursor:pointer}.scenario>summary::-webkit-details-marker{display:none}.scenario>summary:hover{background:var(--soft)}.scenario-id{display:inline-grid;place-items:center;min-width:54px;height:34px;padding:0 10px;border-radius:999px;background:var(--blue-bg);color:var(--blue);font-weight:800}.scenario-title{font-size:16px;font-weight:800}.scenario-meta{display:flex;gap:8px;color:var(--muted2);font-size:12px}.scenario-body{padding:0 18px 18px;border-top:1px solid var(--line)}.context{margin:14px 0;padding:12px 14px;border-radius:14px;background:var(--soft);color:var(--muted);white-space:pre-wrap}.review-item{scroll-margin-top:150px;margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:18px;background:white}.review-head{display:flex;gap:10px;align-items:flex-start}.review-head h3{margin:0;font-size:16px}.item-id{flex:none;padding:3px 8px;border-radius:8px;background:#edf1f7;color:var(--muted);font:700 12px/1.5 ui-monospace,monospace}.comparison,.extra{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.panel,.extra>div{min-width:0;padding:14px;border:1px solid var(--line);border-radius:14px}.panel h4,.extra h4{margin:0 0 6px;color:var(--muted2);font-size:12px}.panel p,.extra p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.expected{border-color:rgba(47,116,231,.2);background:var(--blue-bg)}.actual,.extra>div{background:var(--soft)}.badge{display:inline-flex;align-items:center;min-height:28px;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.match{color:var(--green);background:var(--green-bg)}.badge.mismatch{color:var(--red);background:var(--red-bg)}.badge.needs-check{color:var(--yellow);background:var(--yellow-bg)}.decision{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.decision-label{margin:0 0 8px;font-weight:800}.verdict{padding:9px 13px;border:1px solid var(--line);border-radius:12px;background:white;color:var(--text);font-weight:750}.verdict[aria-pressed=true][data-verdict=approved]{border-color:var(--green);background:var(--green-bg);color:var(--green)}.verdict[aria-pressed=true][data-verdict=revision]{border-color:var(--red);background:var(--red-bg);color:var(--red)}.verdict[aria-pressed=true][data-verdict=hold]{border-color:var(--yellow);background:var(--yellow-bg);color:var(--yellow)}.note{width:100%;min-height:76px;margin-top:10px;padding:11px 12px;resize:vertical;border:1px solid var(--line);border-radius:12px;color:var(--text);background:white}.note.invalid{border-color:var(--red);background:var(--red-bg)}.help{min-height:20px;margin-top:4px;color:var(--muted2);font-size:12px}.help.error{color:var(--red);font-weight:700}.target{margin-top:10px;color:var(--muted)}.target strong{color:var(--text)}code{padding:1px 5px;border-radius:5px;background:rgba(16,26,43,.08);font-family:ui-monospace,monospace}.empty{display:none;padding:48px;text-align:center;color:var(--muted)}.toast{position:fixed;right:24px;bottom:24px;z-index:20;max-width:360px;padding:12px 16px;border-radius:14px;background:var(--text);color:white;box-shadow:var(--shadow);opacity:0;pointer-events:none;transform:translateY(10px);transition:.2s}.toast.show{opacity:1;transform:none}.footer{padding:24px 0;color:var(--muted2);font-size:12px;text-align:center}
@media(max-width:820px){.shell{padding:16px}.hero{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric:first-child{grid-column:1/-1}.toolbar{position:static;grid-template-columns:1fr}.toolbar .actions{grid-column:auto}.comparison,.extra{grid-template-columns:1fr}.scenario>summary{grid-template-columns:auto 1fr}.scenario-meta{grid-column:1/-1}.review-item{padding:13px}.hero h1{font-size:23px}}
@media print{body{background:white}.hero .actions,.toolbar,.verdicts,.note,.toast{display:none!important}.shell{max-width:none;padding:0}.scenario{box-shadow:none;break-inside:avoid}.scenario:not([open]) .scenario-body{display:block}.review-item{break-inside:avoid}}
</style></head><body><main class="shell">
<header class="hero"><div><div class="eyebrow">DEXCOWIN MES · 사용자 기대값 확인</div><h1>실화면 조사 판정표</h1><p>현재 동작이 아니라, <strong>제시된 기대 반응이 맞는지</strong> 확인해 주세요.</p></div><div class="actions"><button class="button primary" id="nextPending">다음 미확인</button><button class="button" id="exportJson">JSON 내보내기</button><label class="button file-button">JSON 불러오기<input id="importJson" type="file" accept="application/json,.json"></label><button class="button" id="exportCsv">CSV 내보내기</button></div></header>
<section class="metrics" aria-label="판정 현황"><div class="metric"><span>전체 확인 항목</span><strong>${itemCount}</strong></div><div class="metric"><span>미확인</span><strong id="pendingCount">${itemCount}</strong></div><div class="metric approved"><span>기대값 승인</span><strong id="approvedCount">0</strong></div><div class="metric revision"><span>수정 필요</span><strong id="revisionCount">0</strong></div><div class="metric hold"><span>보류</span><strong id="holdCount">0</strong></div></section><div class="progress"><span id="progressBar"></span></div>
<section class="toolbar"><input class="field" id="search" type="search" placeholder="업무·기대·실제 반응 검색"><select class="field" id="category"><option value="">모든 업무</option></select><select class="field" id="verdict"><option value="pending" selected>미확인만</option><option value="">모든 판정</option><option value="approved">기대값 승인</option><option value="revision">수정 필요</option><option value="hold">보류</option></select><select class="field" id="investigation"><option value="">모든 실측 결과</option><option value="match">실측 일치</option><option value="mismatch">실측 불일치</option><option value="needs-check">추가 실측 필요</option></select><div class="actions"><button class="button" id="expandAll">모두 펼치기</button><button class="button" id="collapseAll">모두 접기</button><button class="button" id="clearFilters">필터 초기화</button></div></section>
<section id="scenarios"></section><div class="empty" id="empty">조건에 맞는 확인 항목이 없습니다.</div><footer class="footer">원본: 기능 회귀 업무계약 상세 증거 8.1~8.25</footer></main><div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
const SECTIONS=${data},STORAGE_KEY="dexcowin-mes-regression-review-v1",LABEL={approved:"기대값 맞음",revision:"기대값 수정 필요",hold:"보류"};let reviews=load();
function esc(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}function inline(v){return esc(v).replace(/\x60([^\x60]+)\x60/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>")}function plain(v){return String(v||"").replace(/[\x60*]/g,"")}function kind(v){const t=plain(v);if(/화면 확인|정책 결정|확인 필요|추가 실측|미실행|제출하지|경합 테스트 필요/.test(t))return"needs-check";if(/불일치|오류|누락|오표시|모순|불가|실패|위험|치명|없음|문제/.test(t))return"mismatch";if(/일치|정상|통과|확인/.test(t))return"match";return"needs-check"}function target(v,i){if(!v)return"미확인";if(v==="revision")return"기대값 수정 대기";if(v==="hold")return"판단 보류";const k=kind(i);return k==="needs-check"?"추가 실측 필요":k==="mismatch"?"버그 재현 테스트":"정상 동작 보호 테스트"}function resolved(r){return!!(r&&r.verdict&&!(r.verdict==="revision"&&!String(r.note||"").trim()))}function load(){try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return v&&typeof v==="object"?v:{}}catch{return{}}}function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(reviews));metrics()}function entries(){return SECTIONS.flatMap(s=>s.items.map(i=>({section:s,item:i})))}
function matches(i,s){const r=reviews[i.id]||{},q=search.value.trim().toLowerCase(),v=verdict.value,c=category.value,k=investigation.value;if(c&&s.category!==c)return false;if(v==="pending"&&resolved(r))return false;if(v&&v!=="pending"&&r.verdict!==v)return false;if(k&&kind(i.investigation)!==k)return false;return!q||plain([s.id,s.title,s.category,i.action,i.expected,i.actual,i.coverage,i.investigation,r.note].join(" ")).toLowerCase().includes(q)}
function verdictButton(id,v,current){return'<button class="verdict" data-item="'+id+'" data-verdict="'+v+'" aria-pressed="'+(current===v)+'">'+LABEL[v]+'</button>'}function itemHtml(i){const r=reviews[i.id]||{},k=kind(i.investigation),bad=r.verdict==="revision"&&!String(r.note||"").trim();return'<article class="review-item" id="item-'+i.id+'"><div class="review-head"><span class="item-id">'+i.id+'</span><h3>'+inline(i.action)+'</h3></div><div class="comparison"><div class="panel expected"><h4>기대 반응 · 이 내용이 맞는지 판정</h4><p>'+inline(i.expected||"기대값이 기록되지 않음")+'</p></div><div class="panel actual"><h4>실제로 확인된 반응</h4><p>'+inline(i.actual||"실제 반응이 기록되지 않음")+'</p></div></div><div class="extra"><div><h4>테스트에 포함할 내용</h4><p>'+inline(i.coverage||"별도 기록 없음")+'</p></div><div><h4>기존 조사 판정</h4><span class="badge '+k+'">'+inline(i.investigation||"판정 없음")+'</span></div></div><div class="decision"><p class="decision-label">사용자 판정</p><div class="verdicts">'+verdictButton(i.id,"approved",r.verdict)+verdictButton(i.id,"revision",r.verdict)+verdictButton(i.id,"hold",r.verdict)+'</div><textarea class="note '+(bad?'invalid':'')+'" data-note="'+i.id+'" placeholder="수정할 기대값이나 판단 근거를 적어 주세요.">'+esc(r.note||"")+'</textarea><div class="help '+(bad?'error':'')+'">'+(bad?'수정할 기대값을 적어야 판정이 완료됩니다.':'수정 필요를 선택한 경우 의견은 필수입니다.')+'</div><div class="target">자동 분류: <strong>'+target(r.verdict||"",i.investigation)+'</strong></div></div></article>'}
function render(){const openIds=new Set([...document.querySelectorAll(".scenario[open]")].map(n=>n.dataset.section));scenarios.innerHTML="";let shown=0;for(const s of SECTIONS){const items=s.items.filter(i=>matches(i,s));if(!items.length)continue;shown+=items.length;const d=document.createElement("details"),done=s.items.filter(i=>resolved(reviews[i.id])).length;d.className="scenario";d.dataset.section=s.id;d.open=openIds.has(s.id);d.innerHTML='<summary><span class="scenario-id">'+s.id+'</span><span class="scenario-title">'+inline(s.title)+'</span><span class="scenario-meta"><span>'+s.category+'</span><span>'+done+' / '+s.items.length+' 판정</span></span></summary><div class="scenario-body">'+(s.context?'<div class="context"><strong>실측 배경</strong>\\n'+inline(s.context)+'</div>':'')+items.map(itemHtml).join("")+'</div>';scenarios.appendChild(d)}empty.style.display=shown?"none":"block";bind();metrics()}
function bind(){document.querySelectorAll("[data-verdict]").forEach(b=>b.onclick=()=>{const id=b.dataset.item;reviews[id]={...reviews[id],verdict:b.dataset.verdict,updatedAt:new Date().toISOString()};save();render();const el=document.getElementById("item-"+id);if(el){el.closest("details").open=true;el.scrollIntoView({block:"center"});if(b.dataset.verdict==="revision")el.querySelector("textarea").focus()}});document.querySelectorAll("[data-note]").forEach(t=>t.oninput=()=>{const id=t.dataset.note;reviews[id]={...reviews[id],note:t.value,updatedAt:new Date().toISOString()};save();const bad=reviews[id].verdict==="revision"&&!t.value.trim();t.classList.toggle("invalid",bad);t.nextElementSibling.classList.toggle("error",bad);t.nextElementSibling.textContent=bad?"수정할 기대값을 적어야 판정이 완료됩니다.":"자동 저장됨"})}function metrics(){const counts={approved:0,revision:0,hold:0,pending:0,done:0},all=entries();for(const e of all){const r=reviews[e.item.id]||{};if(resolved(r)){counts.done++;counts[r.verdict]++}else counts.pending++}pendingCount.textContent=counts.pending;approvedCount.textContent=counts.approved;revisionCount.textContent=counts.revision;holdCount.textContent=counts.hold;progressBar.style.width=(all.length?counts.done/all.length*100:0)+"%"}
function download(name,content,type){const u=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),0)}function notify(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove("show"),2200)}function csvCell(v){const t=String(v||"");return/[",\\r\\n]/.test(t)?'"'+t.replaceAll('"','""')+'"':t}function makeCsv(){const rows=[["ID","업무","시나리오","확인 항목","기대 반응","실제 반응","기존 조사 판정","사용자 판정","사용자 의견","테스트 분류"]];for(const e of entries()){const s=e.section,i=e.item,r=reviews[i.id]||{};rows.push([i.id,s.category,s.id+" "+s.title,i.action,i.expected,i.actual,i.investigation,LABEL[r.verdict]||"미확인",r.note||"",target(r.verdict||"",i.investigation)])}return"\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\\r\\n")}
for(const c of [...new Set(SECTIONS.map(s=>s.category))])category.insertAdjacentHTML("beforeend",'<option value="'+esc(c)+'">'+esc(c)+'</option>');for(const id of["search","category","verdict","investigation"])document.querySelector("#"+id).addEventListener(id==="search"?"input":"change",render);clearFilters.onclick=()=>{search.value="";category.value="";verdict.value="pending";investigation.value="";render()};expandAll.onclick=()=>document.querySelectorAll(".scenario").forEach(n=>n.open=true);collapseAll.onclick=()=>document.querySelectorAll(".scenario").forEach(n=>n.open=false);nextPending.onclick=()=>{const e=entries().find(x=>!resolved(reviews[x.item.id]));if(!e)return notify("모든 기대값을 확인했습니다.");verdict.value="pending";render();const el=document.getElementById("item-"+e.item.id);if(el){el.closest("details").open=true;el.scrollIntoView({behavior:"smooth",block:"center"})}};exportJson.onclick=()=>{download("mes-regression-review.json",JSON.stringify({schemaVersion:1,source:"8.1-8.25",exportedAt:new Date().toISOString(),reviews},null,2),"application/json;charset=utf-8");notify("판정 JSON을 저장했습니다.")};exportCsv.onclick=()=>{download("mes-regression-review.csv",makeCsv(),"text/csv;charset=utf-8");notify("Excel용 CSV를 저장했습니다.")};importJson.onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(parsed.schemaVersion!==1||!parsed.reviews||typeof parsed.reviews!=="object")throw Error("지원하지 않는 형식");const ids=new Set(entries().map(x=>x.item.id));reviews=Object.fromEntries(Object.entries(parsed.reviews).filter(x=>ids.has(x[0])));save();render();notify("판정 JSON을 불러왔습니다.")}catch(error){notify("불러오기 실패: "+error.message)}finally{e.target.value=""}};render();
</script></body></html>`;
}

export function generateReview() {
  const sections = parseEvidenceSections(fs.readFileSync(CONTRACT_PATH, "utf8"));
  if (sections.length !== 25) throw new Error(`8.1~8.25 중 ${sections.length}개만 찾았습니다.`);
  fs.writeFileSync(REVIEW_PATH, buildHtml(sections), "utf8");
  return { sectionCount: sections.length, itemCount: sections.reduce((sum, section) => sum + section.items.length, 0), output: REVIEW_PATH };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = generateReview();
  console.log(`HTML 생성 완료: ${result.sectionCount}개 시나리오, ${result.itemCount}개 확인 항목`);
  console.log(result.output);
}
