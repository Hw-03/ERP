---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/screens/desk-dashboard.jsx
status: active
updated: 2026-04-27
source_sha: d247cc8d7502
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# desk-dashboard.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/screens/desk-dashboard.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `15212` bytes

## 연결

- Parent hub: [[docs/design/screens/screens|docs/design/screens]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 254줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Desktop — 대시보드 + 자재 목록 (971 items, KPI-as-filter, right detail panel) */

function DeskDashboard() {
  const { ITEMS, MODELS, CATEGORIES } = window.ERP_DATA;
  const [statusFilter, setStatusFilter] = React.useState("all"); // all | ok | low | out
  const [modelFilter, setModelFilter] = React.useState("all");
  const [catFilter, setCatFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState(ITEMS[0].code);
  const [density, setDensity] = React.useState("cozy");
  const [rightPanel, setRightPanel] = React.useState(true);
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false);

  const filtered = ITEMS.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (modelFilter !== "all" && !i.model.startsWith(modelFilter)) return false;
    if (catFilter !== "all" && i.cat !== catFilter) return false;
    if (q && !(i.name.toLowerCase().includes(q.toLowerCase()) || i.code.includes(q))) return false;
    return true;
  });

  const sel = ITEMS.find(i => i.code === selected) || filtered[0];

  const counts = {
    total: 971, ok: 969, low: 2, out: 0
  };

  const rowH = density === "compact" ? 32 : density === "comfortable" ? 48 : 40;

  return (
    <div className="flex flex-col w-full h-full bg-[#0D1629] text-[#E6ECF5]" style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <div className="flex flex-1 min-h-0">
        <Sidebar active="dash" expanded={sidebarExpanded}/>
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
# ... (이하 185줄 생략. 원본 참조)

````
