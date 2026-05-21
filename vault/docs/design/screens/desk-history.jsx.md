---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/screens/desk-history.jsx
status: active
updated: 2026-04-27
source_sha: 997edfbca250
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# desk-history.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/screens/desk-history.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `10370` bytes

## 연결

- Parent hub: [[docs/design/screens/screens|docs/design/screens]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

````jsx
/* Desktop — 입출고 내역 (history)
   KPI 바 + 필터 + 타임라인 테이블 + 우측 상세 */

function DeskHistory() {
  const { HISTORY } = window.ERP_DATA;
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [rangeFilter, setRangeFilter] = React.useState("today");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState(HISTORY[0].code);
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false);

  const filtered = HISTORY.filter(h => {
    if (typeFilter !== "all" && h.type !== typeFilter) return false;
    if (q && !(h.name.toLowerCase().includes(q.toLowerCase()) || h.code.includes(q))) return false;
    return true;
  });
  const sel = HISTORY.find(h => h.code === selected) || filtered[0];

  const totalIn = HISTORY.filter(h => h.qty > 0).reduce((a,b) => a+b.qty, 0);
  const totalOut = HISTORY.filter(h => h.qty < 0).reduce((a,b) => a+b.qty, 0);

  return (
    <div className="flex w-full h-full bg-[#0D1629] text-[#E6ECF5]" style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <Sidebar active="hist" expanded={sidebarExpanded}/>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title="입출고 내역"
          subtitle="거래 · 조정 · 자동차감"
          meta={<><span>오늘 {filtered.filter(h=>h.ts.startsWith("04/21")).length}건</span><span className="text-[#3A5070]">|</span><span>이번 주 누적 42건</span></>}
          onToggleSidebar={() => setSidebarExpanded(v => !v)}
        />

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
            {/* KPI bar (inline) */}
# ... (이하 130줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
