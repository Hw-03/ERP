---
type: code-note
project: ERP
layer: docs
source_path: docs/design/ERP Redesign.html
status: active
updated: 2026-04-27
source_sha: f283c599167d
tags:
  - erp
  - docs
  - documentation
  - html
---

# ERP Redesign.html

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/ERP Redesign.html`
- Layer: `docs`
- Kind: `documentation`
- Size: `20674` bytes

## 연결

- Parent hub: [[docs/design/design|docs/design]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 348줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````html
<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>X-Ray ERP · Redesign Canvas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable.min.css"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  html, body { background:#0D1629; color:#E6ECF5; font-family: Pretendard, system-ui, sans-serif; }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; }
  * { -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #263858; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #2A3A5E; }

/* ── Light mode theme overrides ── */
[data-theme="light"] {
  color-scheme: light;
}

/* Backgrounds */
[data-theme="light"] .bg-\[\#0D1629\] { background-color: #F0F4FA !important; }
[data-theme="light"] .bg-\[\#132240\] { background-color: #FFFFFF !important; }
[data-theme="light"] .bg-\[\#0E1A34\] { background-color: #F4F7FC !important; }
[data-theme="light"] .bg-\[\#0A1020\] { background-color: #F8FAFD !important; }
[data-theme="light"] .bg-\[\#152844\] { background-color: #EBF0FB !important; }
[data-theme="light"] .bg-\[\#172F4C\] { background-color: #DDEEFF !important; }
[data-theme="light"] .bg-\[\#0F2D2A\] { background-color: #CCFBF1 !important; }
[data-theme="light"] .bg-\[\#1A3434\] { background-color: #A7F3D0 !important; }
[data-theme="light"] .bg-\[\#182840\] { background-color: #EFF4FC !important; }
[data-theme="light"] .bg-\[\#182A4A\] { background-color: #EBF2FF !important; }
[data-theme="light"] .bg-\[\#172C48\] { background-color: #E5EDFA !important; }
[data-theme="light"] .bg-\[\#192E4C\] { background-color: #EBF2FF !important; }
[data-theme="light"] .bg-\[\#1D3A3A\] { background-color: #CCFBF1 !important; }
[data-theme="light"] .bg-\[\#2B1620\] { background-color: #FEE2E2 !important; }
[data-theme="light"] .bg-\[\#3A1A22\] { background-color: #FEE2E2 !important; }
[data-theme="light"] .bg-\[\#3A2D15\] { background-color: #FEF3C7 !important; }
[data-theme="light"] .bg-\[\#15292A\] { background-color: #CCFBF1 !important; }
[data-theme="light"] .bg-\[\#102D2A\] { background-color: #CCFBF1 !important; }
[data-theme="light"] .bg-\[\#1E0D14\] { background-color: #FFF1F2 !important; }
[data-theme="light"] .bg-\[\#142033\] { background-color: #EBF2FF !important; }
[data-theme="light"] .bg-\[\#0F1A30\] { background-color: #EBF0FB !important; }
[data-theme="light"] .bg-black\/60 { background-color: rgba(180,190,210,0.5) !important; }

/* Borders */
[data-theme="light"] .border-\[\#1C2C4A\] { border-color: #D8E2F4 !important; }
[data-theme="light"] .border-\[\#263858\] { border-color: #C8D4EC !important; }
[data-theme="light"] .border-\[\#2B5C58\] { border-color: #2DD4BF !important; }
[data-theme="light"] .border-\[\#2B8378\] { border-color: #14B8A6 !important; }
[data-theme="light"] .border-\[\#6B2B36\] { border-color: #FCA5A5 !important; }
[data-theme="light"] .border-\[\#5A2733\] { border-color: #FCA5A5 !important; }
[data-theme="light"] .border-\[\#6B4E1F\] { border-color: #FCD34D !important; }
[data-theme="light"] .border-\[\#4A1E29\] { border-color: #FECACA !important; }
[data-theme="light"] .border-\[\#141D36\] { border-color: #DDE5F5 !important; }
[data-theme="light"] .border-\[\#1E2A48\] { border-color: #C8D4EC !important; }
[data-theme="light"] .border-transparent { border-color: transparent !important; }

/* Text */
[data-theme="light"] .text-\[\#E6ECF5\] { color: #1A2036 !important; }
[data-theme="light"] .text-\[\#8A97B3\] { color: #52617A !important; }
[data-theme="light"] .text-\[\#5A6785\] { color: #8A97B3 !important; }
[data-theme="light"] .text-\[\#6C7A99\] { color: #6B7A9A !important; }
[data-theme="light"] .text-\[\#B6C1DC\] { color: #3D4F6E !important; }
[data-theme="light"] .text-\[\#D5DCEC\] { color: #2D3A52 !important; }
[data-theme="light"] .text-\[\#3A5070\] { color: #94A3B8 !important; }

/* Semantic accent colors — adjusted for light bg contrast */
[data-theme="light"] .text-\[\#7BE0D0\] { color: #0D7A6E !important; }
[data-theme="light"] .text-\[\#4FB37A\] { color: #047857 !important; }

/* Primary button */
[data-theme="light"] .bg-\[\#1F6B62\] { background-color: #0D9488 !important; }
[data-theme="light"] .hover\:bg-\[\#247A70\]:hover { background-color: #0F766E !important; }

/* Dividers */
[data-theme="light"] .divide-\[\#141D36\] > * + * { border-color: #DDE5F5 !important; }

/* Scrollbar */
[data-theme="light"] ::-webkit-scrollbar-thumb { background: #C8D4EC; }
[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: #A8BAD8; }

/* Focus border */
[data-theme="light"] .focus-within\:border-\[\#2B5C58\]:focus-within { border-color: #14B8A6 !important; }
[data-theme="light"] .focus\:border-\[\#2B5C58\]:focus { border-color: #14B8A6 !important; }

/* The design canvas background */
[data-theme="light"] #root > div { background: #E8EDF8 !important; }

/* Input placeholder */
[data-theme="light"] input::placeholder,
[data-theme="light"] textarea::placeholder { color: #8A97B3 !important; }

/* Theme toggle button */
#theme-toggle {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #263858;
  background: #132240;
  color: #D5DCEC;
  font-family: Pretendard, system-ui, sans-serif;
  transition: all 0.15s;
}
[data-theme="light"] #theme-toggle {
  background: #FFFFFF;
  border-color: #C8D4EC;
  color: #2D3A52;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

</style>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
</head>
<body>
<div id="root"></div>

<script type="text/babel" src="design-canvas.jsx"></script>
<script type="text/babel" src="data.jsx"></script>
<script type="text/babel" src="ui.jsx"></script>
<script type="text/babel" src="screens/desk-dashboard.jsx"></script>
<script type="text/babel" src="screens/desk-warehouse.jsx"></script>
<script type="text/babel" src="screens/desk-history.jsx"></script>
<script type="text/babel" src="screens/desk-admin.jsx"></script>
<script type="text/babel" src="screens/mobile.jsx"></script>

<script type="text/babel" data-presets="env,react">
  const { DesignCanvas, DCSection, DCArtboard } = window;

  function App() {
    return (
      <DesignCanvas title="X-Ray ERP · Redesign"
        subtitle="의료장비 제조 현장 · 블루시 다크 + 틸 액센트 · Pretendard / JetBrains Mono">

        <DCSection id="system" title="디자인 시스템 · 한눈에" defaultBg="#0D1629">
          <DCArtboard id="tokens" label="디자인 토큰" width={1440} height={540}>
            <SystemOverview/>
          </DCArtboard>
        </DCSection>

        <DCSection id="desktop" title="데스크톱 (1440×900)" defaultBg="#0D1629">
          <DCArtboard id="desk-dash" label="01 · 대시보드 + 자재 목록" width={1440} height={900}>
            <window.DeskDashboard/>
          </DCArtboard>
          <DCArtboard id="desk-wh" label="02 · 입출고 워크스테이션" width={1440} height={900}>
            <window.DeskWarehouse/>
          </DCArtboard>
          <DCArtboard id="desk-hist" label="03 · 입출고 내역" width={1440} height={900}>
            <window.DeskHistory/>
          </DCArtboard>
          <DCArtboard id="desk-adm" label="04 · 관리자 (품목/BOM/직원/설정)" width={1440} height={900}>
            <window.DeskAdmin/>
          </DCArtboard>
        </DCSection>

        <DCSection id="mobile" title="모바일 (390×844)" defaultBg="#0D1629">
          <DCArtboard id="mob-inv" label="05 · 재고 리스트" width={390} height={844}>
            <window.MobileInventory/>
          </DCArtboard>
          <DCArtboard id="mob-det" label="06 · 품목 상세 (바텀시트)" width={390} height={844}>
            <window.MobileInventoryDetail/>
          </DCArtboard>
          <DCArtboard id="mob-wh" label="07 · 창고 입출고" width={390} height={844}>
            <window.MobileWarehouse/>
          </DCArtboard>
          <DCArtboard id="mob-adm" label="08 · 관리자 PIN" width={390} height={844}>
            <window.MobileAdminPin/>
          </DCArtboard>
        </DCSection>

      </DesignCanvas>
    );
  }

  function SystemOverview() {
    const swatches = [
      ["bg",        "#0D1629", "배경 (앱 루트)"],
      ["bg-2",      "#132240", "표면 (카드)"],
      ["surface",   "#152240", "인풋 · 호버"],
      ["line",      "#263858", "테두리"],
      ["line-soft", "#1C2C4A", "행 구분선"],
      ["text",      "#E6ECF5", "본문"],
      ["muted",     "#8A97B3", "보조 텍스트"],
      ["faint",     "#5A6785", "플레이스홀더"],
    ];
    const accents = [
      ["accent (teal)", "#3BC5B4", "선택 · 포커스 · 입고"],
      ["accent dim",    "#7BE0D0", "강조 숫자 · 링크"],
      ["amber (부족)",   "#E0A63C", "안전재고 미달"],
      ["rose (품절/출고)", "#E5576E", "차감 · 위험 액션"],
      ["emerald (+)",   "#4FB37A", "입고 증가"],
    ];
    return (
      <div className="w-full h-full p-8 grid grid-cols-12 gap-6 overflow-auto" style={{background:"#0D1629", color:"#E6ECF5"}}>
        <div className="col-span-12 pb-2 border-b border-[#1C2C4A] flex items-baseline gap-3">
          <h2 className="text-[22px] font-semibold tracking-tight">X-Ray ERP · Design Tokens</h2>
          <span className="text-[11px] text-[#8A97B3]">블루시 다크 #0D1629 · 차분한 틸 액센트 · Pretendard + JetBrains Mono</span>
        </div>

        {/* Neutrals */}
        <div className="col-span-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">Neutrals</div>
          <div className="space-y-1.5">
            {swatches.map(([n,h,d]) => (
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
