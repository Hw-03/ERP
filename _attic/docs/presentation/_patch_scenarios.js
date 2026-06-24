// 시나리오 슬라이드를 subway-map 스타일로 교체하는 패치 스크립트
const fs = require("fs");
const P = "_attic/docs/presentation/_build_redesign.js";
let t = fs.readFileSync(P, "utf8");

const newBlock = `// ── 시나리오 슬라이드 빌더: 전체 경로 지도에서 해당 시나리오만 강조 ──
// 노드 순서: 0=격리, 1=분해, 2=튜닝, 3=진공, 4=고압, 5=튜브, 6=연구소, 7=종결
// active: 강조할 노드 인덱스 배열. 나머지는 흐리게 표시.
function mapSlide({ slide, kicker, h1, sub, active, caseid, note }) {
  const nodes = [
    { dot: "격리", h3: "격리",    small: "부적합 번호 생성" },
    { dot: "분해", h3: "분해",    small: "BOM 전개" },
    { dot: "튜닝", h3: "튜닝파트", small: "NF 이관·확인" },
    { dot: "진공", h3: "진공파트", small: "VF 재작업" },
    { dot: "고압", h3: "고압파트", small: "HF 재작업" },
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
    return \`<div class="pn\${dim ? " dim" : ""}"><div class="dot"\${s}>\${n.dot}</div><h3>\${n.h3}</h3><small>\${n.small}</small></div>\`;
  }).join("");
  const N = 8, L = (100 / (2 * N)).toFixed(2);
  const css = \`[data-slide="\${slide}"] .parts{grid-template-columns:repeat(\${N},1fr)}[data-slide="\${slide}"] .parts:before{left:\${L}%;right:\${L}%}[data-slide="\${slide}"] .dim .dot{border-color:#dce8f5!important;color:#dce8f5!important;background:#f8fafc}[data-slide="\${slide}"] .dim h3{color:#cdd8e5}[data-slide="\${slide}"] .dim small{color:#d8e4ee}\`;
  return \`<div class="kicker">\${kicker}</div><h1>\${h1}</h1><p class="sub">\${sub}</p><div class="stage"><div class="history"><style>\${css}</style><div class="caseid">\${caseid}</div><div class="parts">\${pn}</div></div></div><div class="note">\${note}</div>\`;
}

// 시나리오 A: AF 완제품 → 전 파트 순서대로 재작업
slides[10] = mapSlide({
  slide: 10, kicker: "09 · 시나리오 A",
  h1: "AF 완제품 분해 → <em>전 파트 순서대로 재작업</em>",
  sub: "불량 완제품을 분해하면 발생부(NF)와 자식 부품이 나옵니다. 튜닝·진공·고압·튜브 순서로 이관하며 재작업 후 종결합니다.",
  active: [0, 1, 2, 3, 4, 5, 7],
  caseid: "ADX4000W(AF) · 조립파트 격리 → 분해 → 전 파트 경유 → 종결",
  note: "<b>AA·AR 단순 자재는 조립파트에서 바로 정상/폐기</b> · 발생부(NF)가 각 파트를 거치며 재작업됩니다.",
});

// 시나리오 B: AF 완제품 → 연구소 직행
slides[11] = mapSlide({
  slide: 11, kicker: "10 · 시나리오 B",
  h1: "AF 완제품 분해 → <em>연구소 직접 이관</em>",
  sub: "중간 파트를 거치지 않고 분해 후 연구소로 바로 보내는 경우입니다.",
  active: [0, 1, 6, 7],
  caseid: "ADX4000W(AF) · 조립파트 격리 → 분해 → 연구소 직행 → 종결",
  note: "<b>파트 이관 없이 연구소가 직접 분석·처리</b> · 완제품 상태 또는 분해 후 이관합니다.",
});

// 시나리오 C: 중간 단계(진공파트)에서 불량 발생 → 이어서 처리
slides[12] = mapSlide({
  slide: 12, kicker: "11 · 시나리오 C",
  h1: "중간 단계 불량 → <em>거기서부터 순서대로 처리</em>",
  sub: "완제품이 아닌 진공파트 단계에서 불량이 발견된 경우입니다. 그 지점부터 고압·튜브 순서로 이어갑니다.",
  active: [3, 4, 5, 7],
  caseid: "VF · 진공파트에서 격리 시작 → 고압 → 튜브 → 종결",
  note: "<b>어느 단계에서 발견되든 그 지점부터 동일한 흐름</b> · 앞 단계는 건너뜁니다.",
});

// 시나리오 D: 중간 단계 → 연구소 이관
slides[13] = mapSlide({
  slide: 13, kicker: "12 · 시나리오 D",
  h1: "중간 단계 불량 → <em>연구소 이관</em>",
  sub: "진공파트에서 격리된 부품을 연구소가 직접 수령하는 경우입니다.",
  active: [3, 6, 7],
  caseid: "VF · 진공파트에서 격리 → 연구소 직접 이관 → 종결",
  note: "<b>이관 대상이 연구소이더라도 동일한 이관 절차</b> · 수령 확인 후 관리 책임이 이동합니다.",
});

`;

// 기존 시나리오 블록을 새 내용으로 교체
t = t.replace(
  /\/\/ ── 09 시나리오 A[\s\S]*?\/\/ ── 10 시나리오 B[\s\S]*?;\n\n/,
  newBlock
);

// 로그 메시지도 업데이트
t = t.replace(
  /console\.log\("OK injected slides:".*\);/,
  `console.log("OK injected slides:", Object.keys(slides).join(","), "+ post(kicker6 / remove4)");`
);

fs.writeFileSync(P, t, "utf8");
console.log("patched");
