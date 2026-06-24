// 부적합품관리기획.html 슬라이드 리디자인 빌드 스크립트 (idempotent)
// 6페이지(.history/.parts/.pn/.dot/.band) 언어로 흐름 슬라이드 통일.
// 3+4 병합으로 9장 구성. 마커 /*RD-START*/ ../*RD-END*/ 사이를 통째로 교체. 재실행 안전.
const fs = require("fs");
const P = "_attic/docs/presentation/부적합품관리기획.html";
let t = fs.readFileSync(P, "utf8");

// 1) 이전 슬라이드5 단독 주입 제거 (있으면)
t = t.replace(/document\.querySelector\(`\[data-slide="5"\]`\)\.innerHTML=`[^`]*`;/g, "");
// 2) 이전 RD 블록 제거 (있으면)
t = t.replace(/\/\*RD-START\*\/[\s\S]*?\/\*RD-END\*\//g, "");

// --- 직선 흐름 슬라이드 빌더 ---
function linear({ slide, kicker, h1, sub, caseid, nodes, band, note, scoped }) {
  const N = nodes.length;
  const L = (100 / (2 * N)).toFixed(2);
  const grid = `[data-slide="${slide}"] .parts{grid-template-columns:repeat(${N},1fr)}[data-slide="${slide}"] .parts:before{left:${L}%;right:${L}%}`;
  const pn = nodes.map(n => `<div class="pn"><div class="dot">${n.dot}</div><h3>${n.h3}</h3><small>${n.small}</small></div>`).join("");
  const bandHtml = band ? `<div class="band">${band.map(b => `<span>${b}</span>`).join("")}</div>` : "";
  const css = grid + (scoped || "");
  return `<div class="kicker">${kicker}</div><h1>${h1}</h1><p class="sub">${sub}</p><div class="stage"><div class="caseid">${caseid}</div><div class="history"><style>${css}</style><div class="parts">${pn}</div>${bandHtml}</div></div><div class="note">${note}</div>`;
}

const slides = {};

// ── 01 최초 등록 (직선 4단계) ──
slides[2] = linear({
  slide: 2,
  kicker: "01 · 최초 등록",
  h1: "불량을 발견하면 <em>격리와 동시에</em> 이력을 시작합니다",
  sub: "발견 즉시 부적합 번호를 만들고 모든 추적을 한 번에 시작합니다.",
  caseid: "최초 등록 · 격리와 동시에 추적 시작",
  nodes: [
    { dot: "발견", h3: "불량 발견", small: "ADX4000W 완제품" },
    { dot: "격리", h3: "조립파트 격리", small: "정상 재고와 분리" },
    { dot: "NR", h3: "부적합 번호", small: "추적 이력 생성" },
    { dot: "재고", h3: "격리 재고", small: "후속 처리 대기" },
  ],
  band: ["발견 위치", "격리 사유", "격리 시각", "격리자"],
  note: "<b>격리 시 번호와 이력만 생성</b> · 엑셀 파일은 만들지 않습니다.",
  scoped: `[data-slide="2"] .pn:nth-child(3) .dot{background:var(--navy);border-color:var(--navy);color:#fff}[data-slide="2"] .pn:last-child .dot{border-color:var(--blue);color:var(--blue)}`,
});

// ── 02 분해와 연결 (구 3+4 병합: 분해 갈래 + 부모-자식 영구 연결·히스토리) ──
slides[3] = `<div class="kicker">02 · 분해와 연결</div><h1>분해해 나눈 자식 부품을 <em>부모와 영구 연결</em>합니다</h1><p class="sub">정상은 돌려보내고 불량은 새 번호로 추적하되, 부모·자식 이력이 영구히 묶여 어디서든 전체 히스토리를 봅니다.</p><div class="stage"><div class="caseid">분해 → 자식 분기 · 부모-자식 영구 연결</div><div class="history"><style>[data-slide="3"] .branch{position:relative;display:grid;grid-template-columns:1fr 1fr;align-items:center;min-height:208px;margin-top:6px}[data-slide="3"] .bnode{display:flex;align-items:center;gap:15px;text-align:left}[data-slide="3"] .bnode h3{margin:0 0 3px}[data-slide="3"] .bsrc{justify-self:center;flex-direction:row-reverse}[data-slide="3"] .bsrc .nlabel{text-align:right}[data-slide="3"] .btargets{justify-self:center;display:flex;flex-direction:column;align-items:flex-start;gap:42px}[data-slide="3"] .bconn{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}[data-slide="3"] .bconn path{fill:none;stroke:#d2e2f7;stroke-width:5;vector-effect:non-scaling-stroke}[data-slide="3"] .branch .bsrc .dot{border-color:var(--blue);color:var(--blue)}[data-slide="3"] .btargets .dot.ok{border-color:var(--green);color:var(--green)}[data-slide="3"] .btargets .dot.bad{border-color:var(--red);color:var(--red)}[data-slide="3"] .band .lead{color:#8fc0ff}</style><div class="branch"><svg class="bconn" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M34,50 C48,50 50,25 63,25"/><path d="M34,50 C48,50 50,75 63,75"/></svg><div class="pn bnode bsrc"><div class="dot">분해</div><div class="nlabel"><h3>ADX4000W</h3><small>공정완료품</small></div></div><div class="btargets"><div class="pn bnode"><div class="dot ok">정상</div><div class="nlabel"><h3>정상 자식 부품</h3><small>원래 관리 파트 정상 재고로 반환</small></div></div><div class="pn bnode"><div class="dot bad">불량</div><div class="nlabel"><h3>부적합 자식 부품</h3><small>새 번호로 계속 추적</small></div></div></div></div><div class="band"><span class="lead">조회 가능한 히스토리</span><span>최초 등록</span><span>분해</span><span>파트 이관</span><span>처리</span><span>종결</span></div></div></div><div class="note"><b>부모는 연결이 완성되면 자동 종결</b> · 자식 부품은 독립적으로 계속 처리합니다.</div>`;

// (구 03 부모와 자식 → 02 분해와 연결로 병합. 슬라이드 4 div 는 RD 후처리에서 제거)

// ── 03 파트 이관 (직선 3단계) ──
slides[5] = linear({
  slide: 5,
  kicker: "03 · 파트 이관",
  h1: "자식 부품은 <em>수령 확인 후</em> 격리 재고로 이동합니다",
  sub: "받는 파트가 실물을 확인해야 이관이 완료되고 관리 책임이 넘어갑니다.",
  caseid: "자식 부품 이관 · 같은 부적합 번호 유지",
  nodes: [
    { dot: "요청", h3: "이관 요청", small: "하위 파트로 보냄" },
    { dot: "확인", h3: "수령 확인", small: "받는 파트가 실물 확인" },
    { dot: "완료", h3: "이관 완료", small: "해당 파트 격리 재고로 이동" },
  ],
  band: ["요청자·수령자", "이동 시각", "이관 사유", "현재 보관 위치"],
  note: "<b>수령 확인이 이관 완료 기준</b> · 실물과 재고의 위치를 일치시킵니다.",
  scoped: `[data-slide="5"] .pn:first-child .dot{border-color:var(--blue);color:var(--blue)}`,
});

// ── 04 이동 이력 (직선 5단계: 조립→튜닝→진공→고압→튜브, 연구소 제외) ──
slides[6] = linear({
  slide: 6,
  kicker: "04 · 이동 이력",
  h1: "파트가 바뀌어도 <em>같은 부적합 번호</em>로 추적합니다",
  sub: "자식 부품이 해체되지 않는 동안 하나의 이력에 모든 이동과 작업을 누적합니다.",
  caseid: "동일 부적합 번호 · 중간공정 자식 부품",
  nodes: [
    { dot: "시작", h3: "조립파트", small: "분해 후 격리" },
    { dot: "→", h3: "튜닝파트", small: "격리·원인 확인" },
    { dot: "→", h3: "진공파트", small: "분석·재작업" },
    { dot: "→", h3: "고압파트", small: "추가 분석" },
    { dot: "종결", h3: "튜브파트", small: "이관 종결" },
  ],
  band: ["요청자·수령자", "이동 시각", "이관 사유", "현재 보관 위치"],
  note: "<b>요청자·수령자·이동 시각·이관 사유를 같은 번호에 누적</b> · 현재 위치와 전체 이동 경로를 함께 확인합니다.",
  scoped: `[data-slide="6"] .pn:last-child .dot{border-color:var(--green);color:var(--green)}`,
});

// ── 05 단계별 추적 (세로 타임라인: 모든 사건이 하나의 번호 이력에 시간순으로 쌓임) ──
slides[7] = `<div class="kicker">05 · 단계별 추적</div><h1>모든 단계가 <em>하나의 이력으로</em> 모입니다</h1><p class="sub">분해·이관·처리 — 어떤 단계의 사건이든 하나의 부적합 번호 이력에 시간순으로 쌓입니다.</p><div class="stage"><div class="caseid">동일 부적합 번호 · 하나의 통합 이력</div><div class="history"><style>[data-slide="7"] .tl{position:relative;width:76%;max-width:900px;margin:10px auto 0}[data-slide="7"] .tl:before{content:"";position:absolute;left:35px;top:18px;bottom:18px;width:5px;background:#d2e2f7;border-radius:3px}[data-slide="7"] .ev{position:relative;display:flex;align-items:center;gap:20px;padding:9px 0}[data-slide="7"] .ev .mk{flex:0 0 auto;width:60px;height:60px;border:5px solid var(--blue);border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--blue);font-size:13px;font-weight:950;z-index:1}[data-slide="7"] .ev.first .mk{border-color:var(--red);color:var(--red)}[data-slide="7"] .ev.last .mk{border-color:var(--green);color:var(--green)}[data-slide="7"] .ev .et{display:flex;flex-direction:column}[data-slide="7"] .ev .et b{font-size:clamp(17px,1.4vw,22px)}[data-slide="7"] .ev .et small{color:var(--muted);font-weight:750;font-size:clamp(14px,1.05vw,16px);margin-top:2px}</style><div class="tl"><div class="ev first"><div class="mk">등록</div><div class="et"><b>최초 등록 · 격리</b><small>공정완료품 · 조립파트</small></div></div><div class="ev"><div class="mk">분해</div><div class="et"><b>분해 → 중간공정 자식 부품</b><small>1차 분해</small></div></div><div class="ev"><div class="mk">분해</div><div class="et"><b>분해 → 원자재 자식 부품</b><small>2차 분해 · 더 깊은 단계</small></div></div><div class="ev last"><div class="mk">처리</div><div class="et"><b>처리 결과 기록</b><small>정상 복귀 또는 폐기</small></div></div></div></div></div><div class="note"><b>어느 단계·어느 자식에서도</b> 최초 완제품까지 하나의 히스토리로 역추적합니다.</div>`;

// ── 06 처리 완료 (종결 = 모든 수량이 정상·폐기. 이관·격리는 미처리) ──
slides[8] = `<div class="kicker">06 · 처리 완료</div><h1>모든 수량이 <em>정상·폐기로</em> 끝나면 종결됩니다</h1><p class="sub">정상 복귀와 폐기만 최종 처리입니다 · 이관·격리 상태로 남아 있으면 아직 미처리입니다.</p><div class="stage"><div class="caseid">종결 = 미처리 수량 0 · 별도 승인 없음</div><div class="history"><style>[data-slide="8"] .terms{display:grid;grid-template-columns:repeat(2,1fr);width:60%;margin:16px auto 0}[data-slide="8"] .terms .pn:nth-child(1) .dot{border-color:var(--green);color:var(--green)}[data-slide="8"] .terms .pn:nth-child(2) .dot{border-color:var(--red);color:var(--red)}[data-slide="8"] .mconn{width:60%;height:48px;display:block;margin:4px auto 6px}[data-slide="8"] .mconn path{fill:none;stroke:#d2e2f7;stroke-width:5;vector-effect:non-scaling-stroke}[data-slide="8"] .endnode{display:flex;flex-direction:column;align-items:center;gap:9px}[data-slide="8"] .endnode .dot{width:62px;height:62px;border:5px solid var(--green);border-radius:50%;display:grid;place-items:center;color:var(--green);font-size:14px;font-weight:950;background:#fff}[data-slide="8"] .endnode strong{font-size:clamp(19px,1.6vw,26px);color:var(--navy)}[data-slide="8"] .pending{width:max-content;max-width:92%;margin:15px auto 0;padding:9px 18px;border-radius:11px;background:var(--rs);color:var(--red);font-weight:850;font-size:clamp(13px,1.1vw,16px)}</style><div class="terms"><div class="pn"><div class="dot">정상</div><h3>정상 재고 복귀</h3><small>재검사 통과</small></div><div class="pn"><div class="dot">폐기</div><h3>확인 후 즉시 폐기</h3><small>최종 확인창 후</small></div></div><svg class="mconn" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M25,0 C25,55 50,42 50,100"/><path d="M75,0 C75,55 50,42 50,100"/></svg><div class="endnode"><div class="dot">종결</div><strong>모든 수량이 정상·폐기로 끝남 → 자동 종결</strong></div><div class="pending">이관·격리 상태로 남아 있으면 미처리 — 종결 아님</div></div></div><div class="note"><b>이관은 책임 이동일 뿐</b> · 잘못 처리한 경우 삭제하지 않고 정정 이력을 추가합니다.</div>`;

// ── 07 보고서 출력 (직선 3단계) ──
slides[9] = linear({
  slide: 9,
  kicker: "07 · 보고서 출력",
  h1: "보고서는 <em>필요할 때</em> 엑셀로 생성합니다",
  sub: "평소엔 데이터만 쌓고, 필요한 순간에만 엑셀로 내려받습니다.",
  caseid: "부적합품 보고서 · 필요 시 생성",
  nodes: [
    { dot: "데이터", h3: "프로그램 데이터·이력", small: "서버에 누적" },
    { dot: "엑셀", h3: "부적합품 엑셀 보고서", small: "필요 시 생성" },
    { dot: "PC", h3: "사용자 PC 다운로드", small: "로컬 저장" },
  ],
  band: ["부적합 번호", "이동·분해 이력", "처리 결과", "현재 위치"],
  note: "<b>서버에는 데이터만 보관</b> · 생성된 엑셀 파일은 서버에 쌓지 않습니다.",
  scoped: `[data-slide="9"] .pn:first-child .dot{border-color:var(--blue);color:var(--blue)}`,
});

// ── 시나리오 슬라이드 빌더: 전체 경로 지도에서 해당 시나리오만 강조 ──
// 노드 순서: 0=격리, 1=분해, 2=튜닝, 3=진공, 4=고압, 5=튜브, 6=연구소, 7=종결
// active: 강조할 노드 인덱스 배열. 나머지는 흐리게 표시.
function mapSlide({ slide, kicker, h1, sub, active, caseid, note }) {
  const nodes = [
    { dot: "격리", h3: "격리",    small: "부적합 번호 생성" },
    { dot: "조립", h3: "조립파트", small: "완제품·반제품 분해" },
    { dot: "튜닝", h3: "튜닝파트", small: "발생부 이관·확인" },
    { dot: "진공", h3: "진공파트", small: "발생부 재작업" },
    { dot: "고압", h3: "고압파트", small: "고압보드 재작업" },
    { dot: "튜브", h3: "튜브파트", small: "최종 재작업" },
    { dot: "연구소", h3: "연구소", small: "직접 이관·분석" },
    { dot: "종결", h3: "종결",    small: "처리 완료" },
  ];
  const pn = nodes.map((n, i) => {
    const dim = !active.includes(i);
    const isStart = active[0] === i;
    const isEnd   = active[active.length - 1] === i;
    const isLab   = i === 6 && !dim;
    const s = dim ? "" :
      isStart ? ' style="border-color:var(--red);color:var(--red)"' :
      isEnd   ? ' style="border-color:var(--green);color:var(--green)"' :
      isLab   ? ' style="border-color:var(--amber,#d97706);color:var(--amber,#d97706)"' : "";
    return `<div class="pn${dim ? " dim" : ""}"><div class="dot"${s}>${n.dot}</div><h3>${n.h3}</h3><small>${n.small}</small></div>`;
  }).join("");
  const N = 8, L = (100 / (2 * N)).toFixed(2);
  const css = `[data-slide="${slide}"] .parts{grid-template-columns:repeat(${N},1fr)}[data-slide="${slide}"] .parts:before{left:${L}%;right:${L}%}[data-slide="${slide}"] .dim .dot{border-color:#dce8f5!important;color:#dce8f5!important;background:#f8fafc}[data-slide="${slide}"] .dim h3{color:#cdd8e5}[data-slide="${slide}"] .dim small{color:#d8e4ee}`;
  return `<div class="kicker">${kicker}</div><h1>${h1}</h1><p class="sub">${sub}</p><div class="stage"><div class="caseid">${caseid}</div><div class="history"><style>${css}</style><div class="parts">${pn}</div></div></div><div class="note">${note}</div>`;
}

// 시나리오 A: AF 완제품 → 전 파트 순서대로 재작업
slides[10] = mapSlide({
  slide: 10, kicker: "08 · 시나리오 A",
  h1: "AF 완제품 분해 → <em>생산 파트 전체 순환 재작업</em>",
  sub: "불량 완제품을 분해하면 발생부와 자식 부품이 나옵니다. 튜닝·진공·고압·튜브 순서로 이관하며 재작업 후 종결합니다.",
  active: [0, 1, 2, 3, 4, 5, 7],
  caseid: "ADX4000W(AF) · 조립파트 격리 → 분해 → 전 파트 경유 → 종결",
  note: "<b>AA·AR 단순 자재는 조립파트에서 바로 정상/폐기</b> · 발생부가 각 파트를 거치며 재작업됩니다.",
});

// 시나리오 B: AF 완제품 → 연구소 직행
slides[11] = mapSlide({
  slide: 11, kicker: "09 · 시나리오 B",
  h1: "AF 완제품 분해 → <em>연구소 직접 이관</em>",
  sub: "중간 파트를 거치지 않고 분해 후 연구소로 바로 보내는 경우입니다.",
  active: [0, 1, 6, 7],
  caseid: "ADX4000W(AF) · 조립파트 격리 → 분해 → 연구소 직행 → 종결",
  note: "<b>파트 이관 없이 연구소가 직접 분석·처리</b> · 완제품 상태 또는 분해 후 이관합니다.",
});

// 시나리오 C: 중간 단계(진공파트)에서 불량 발생 → 이어서 처리
slides[12] = mapSlide({
  slide: 12, kicker: "10 · 시나리오 C",
  h1: "중간 단계 불량 → <em>거기서부터 순서대로 처리</em>",
  sub: "완제품이 아닌 진공파트 단계에서 불량이 발견된 경우입니다. 그 지점부터 고압·튜브 순서로 이어갑니다.",
  active: [3, 4, 5, 7],
  caseid: "진공파트에서 격리 시작 → 고압 → 튜브 → 종결",
  note: "<b>어느 단계에서 발견되든 그 지점부터 동일한 흐름</b> · 앞 단계는 건너뜁니다.",
});

// 시나리오 D: 중간 단계 → 연구소 이관
slides[13] = mapSlide({
  slide: 13, kicker: "11 · 시나리오 D",
  h1: "중간 단계 불량 → <em>연구소 이관</em>",
  sub: "진공파트에서 격리된 부품을 연구소가 직접 수령하는 경우입니다.",
  active: [3, 6, 7],
  caseid: "진공파트에서 격리 → 연구소 직접 이관 → 종결",
  note: "<b>이관 대상이 연구소이더라도 동일한 이관 절차</b> · 수령 확인 후 관리 책임이 이동합니다.",
});

// 시나리오 E: 발생 파트에서 바로 종결 (조립~튜브 사이클 애니메이션)
{
  const _N = 8, _L = (100 / (2 * _N)).toFixed(2);
  const _nd = [
    {dot:"격리",  h3:"격리",     small:"부적합 번호 생성",  c:"dim"},
    {dot:"조립",  h3:"조립파트", small:"완제품·반제품 분해", c:"cyc dim"},
    {dot:"튜닝",  h3:"튜닝파트", small:"발생부 이관·확인",  c:"cyc dim"},
    {dot:"진공",  h3:"진공파트", small:"발생부 재작업",      c:"cyc dim"},
    {dot:"고압",  h3:"고압파트", small:"고압보드 재작업",    c:"cyc dim"},
    {dot:"튜브",  h3:"튜브파트", small:"최종 재작업",        c:"cyc dim"},
    {dot:"연구소",h3:"연구소",   small:"직접 이관·분석",     c:"dim"},
    {dot:"종결",  h3:"종결",     small:"처리 완료",          c:"",  s:' style="border-color:var(--green);color:var(--green)"'},
  ];
  const _pn = _nd.map(n=>`<div class="pn${n.c?" "+n.c:""}"><div class="dot"${n.s||""}>${n.dot}</div><h3>${n.h3}</h3><small>${n.small}</small></div>`).join("");
  const _css = `[data-slide="14"] .parts{grid-template-columns:repeat(${_N},1fr)}[data-slide="14"] .parts:before{left:${_L}%;right:${_L}%}[data-slide="14"] .dim .dot{border-color:#dce8f5!important;color:#dce8f5!important;background:#f8fafc}[data-slide="14"] .dim h3{color:#cdd8e5}[data-slide="14"] .dim small{color:#d8e4ee}[data-slide="14"] .cyc .dot{transition:border-color .35s,color .35s,background .35s}[data-slide="14"] .cyc.lit .dot{border-color:var(--red)!important;color:var(--red)!important;background:#fff!important}[data-slide="14"] .cyc.lit h3{color:var(--ink)!important}[data-slide="14"] .cyc.lit small{color:var(--muted)!important}`;
  slides[14] = `<div class="kicker">12 · 시나리오 E</div><h1>발생 파트에서 <em>그 자리에서 종결</em></h1><p class="sub">다른 파트로 이관하지 않고, 발생한 파트 안에서 재작업·폐기·정상 복귀로 바로 처리하는 경우입니다.</p><div class="stage"><div class="caseid">해당 파트 격리 → 해당 파트 처리 → 종결 · 어느 파트에서나 동일</div><div class="history"><style>${_css}</style><div class="parts">${_pn}</div></div></div><div class="note"><b>이관 없이 발생 파트가 처음이자 마지막</b> · 원자재 단품 불량, 단순 외관 폐기 등 이관이 필요 없는 케이스에 해당합니다.</div>`;
}


// ── 마무리 슬라이드 ──
{
  const _css = `[data-slide="15"] .sums{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}[data-slide="15"] .sm{padding:26px 24px;border:2px solid var(--line);border-radius:17px;background:#fff;box-shadow:0 4px 14px rgba(16,33,59,.06)}[data-slide="15"] .sm.bl{border-color:var(--blue);background:var(--bs)}[data-slide="15"] .sm.gr{border-color:var(--green);background:var(--gs)}[data-slide="15"] .sn{font-size:clamp(38px,3.4vw,54px);font-weight:950;line-height:1;margin-bottom:12px;color:#cdd8e5}[data-slide="15"] .sm.bl .sn{color:var(--blue)}[data-slide="15"] .sm.gr .sn{color:var(--green)}[data-slide="15"] .sm h3{font-size:clamp(18px,1.55vw,24px);margin:0 0 8px;font-weight:950}[data-slide="15"] .sm p{margin:0;color:var(--muted);font-size:clamp(14px,1.1vw,17px);font-weight:700;line-height:1.55}[data-slide="15"] .qa{text-align:center;padding:13px 16px;border-radius:11px;background:#f4f7fb;color:var(--muted);font-size:clamp(13px,1.05vw,16px);font-weight:800}`;
  slides[15] = `<div class="kicker">마무리</div><h1>부적합이 <em>기록되고 흐릅니다</em></h1><p class="sub">격리부터 종결까지, 한 번호로 모든 이력을 추적합니다.</p><div class="stage"><div class="history"><style>${_css}</style><div class="sums"><div class="sm bl"><div class="sn">01</div><h3>즉시 격리</h3><p>발견 즉시 번호 생성<br>정상 재고와 즉시 분리</p></div><div class="sm"><div class="sn">02</div><h3>파트 간 이관</h3><p>수령 확인 후 책임 이전<br>같은 번호로 계속 추적</p></div><div class="sm gr"><div class="sn">03</div><h3>자동 종결</h3><p>미처리 수량 0이 되면<br>별도 승인 없이 종결</p></div></div><div class="qa">질문이나 보완이 필요한 부분이 있으면 말씀해 주세요.</div></div></div><div class="note"><b>전산화 목표</b> · 지금 어느 파트에 얼마나 쌓여 있는지 · 지금까지 어떻게 흘렀는지 이력까지</div>`;
}

// --- 주입 ---
// 전역 band: 텍스트 폭에 맞춘 알약 형태
const headStyle = "document.head.insertAdjacentHTML('beforeend','<style>.band{width:max-content;max-width:92%;margin-left:auto;margin-right:auto}.history{width:100%}</style>');";
const stmts = Object.entries(slides)
  .map(([n, html]) => "document.querySelector(`[data-slide=\"" + n + "\"]`).innerHTML=`" + html + "`;")
  .join("\n");
// 후처리: 미병합 슬라이드(6 이동·10 종합) kicker 번호 재정렬 + 슬라이드4 div 제거
const post = [
  "var _k6=document.querySelector('[data-slide=\"6\"] .kicker');if(_k6)_k6.textContent='04 · 이동 이력';",
  "var _s4=document.querySelector('[data-slide=\"4\"]');if(_s4)_s4.remove();",
  "(function(){var ps=document.querySelectorAll('[data-slide=\"14\"] .pn.cyc'),i=0;function step(){ps.forEach(function(p){p.classList.remove('lit')});ps[i].classList.add('lit');i=(i+1)%ps.length}step();setInterval(step,900)})();",
].join("\n");
const block = "/*RD-START*/\n" + headStyle + "\n" + stmts + "\n" + post + "\n/*RD-END*/";

const anchor = `</script><div class="ui">`;
if ((t.split(anchor).length - 1) !== 1) { console.error("ABORT anchor count", t.split(anchor).length - 1); process.exit(1); }
t = t.replace(anchor, block + anchor);
fs.writeFileSync(P, t, "utf8");
console.log("OK injected slides:", Object.keys(slides).join(","), "+ post(kicker6 / remove4)");
