---
type: code-note
project: ERP
layer: docs
source_path: docs/design/ui.jsx
status: active
updated: 2026-04-27
source_sha: afdfcaad38be
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# ui.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/ui.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `13596` bytes

## 연결

- Parent hub: [[docs/design/design|docs/design]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 234줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Shared primitives + tokens for the X-Ray ERP mockups.
   All components are attached to window so other Babel scripts can use them. */

const TOKENS = {
  bg: "#0D1629",
  bg2: "#132240",
  surface: "#152240",
  surface2: "#16213D",
  line: "#263858",
  lineSoft: "#17213B",
  text: "#E6ECF5",
  textMuted: "#8A97B3",
  textFaint: "#5A6785",
  accent: "#3BC5B4",      // calm teal
  accentDim: "#1F5E58",
  amber: "#E0A63C",
  rose: "#E5576E",
  emerald: "#4FB37A",
};

/* ---------- Icon set (tiny, 1.5 stroke) ---------- */
const Ic = {
  Box: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 7.5 12 3l9 4.5M3 7.5v9L12 21l9-4.5v-9M3 7.5 12 12m9-4.5L12 12m0 9v-9"/></svg>,
  Warehouse: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 10 12 4l9 6v10H3V10Z"/><path d="M7 20v-7h10v7M10 20v-4h4v4"/></svg>,
  History: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/></svg>,
  Tool: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 20 14 10M4 20l-1-3 3 1M14 10a4 4 0 1 1 4-4 2 2 0 0 0 2 2 4 4 0 1 1-4 4 2 2 0 0 0-2-2Z"/></svg>,
  Search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  Plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  Minus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M5 12h14"/></svg>,
  Refresh: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>,
  Chevron: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m9 6 6 6-6 6"/></svg>,
  ChevronDown: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m6 9 6 6 6-6"/></svg>,
  Up: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m6 15 6-6 6 6"/></svg>,
  Filter: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/></svg>,
  Close: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>,
  Lock: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  Pin: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M12 3v18M5 10l7-7 7 7-3.5 2L12 8l-3.5 4Z"/></svg>,
  QR: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v1"/></svg>,
  Menu: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>,
  Download: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/></svg>,
  Sliders: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h14M18 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="17" r="2"/></svg>,
  People: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M21 20c0-2.3-1.6-4.2-4-4.8"/></svg>,
  Package: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9M7.5 5.25l9 4.5"/></svg>,
  Panel: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>,
  Dot: (p) => <svg viewBox="0 0 8 8" {...p}><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>,
  ArrowRight: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  Back: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M19 12H5M11 18l-6-6 6-6"/></svg>,
};

/* ---------- Status badge ---------- */
function StatusDot({ status, label }) {
  const map = {
    ok: { c: "#8A97B3", t: "정상" },
    low: { c: "#E0A63C", t: "부족" },
    out: { c: "#E5576E", t: "품절" },
  };
  const s = map[status] || map.ok;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: s.c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }}/>
      <span className="tracking-tight">{label ?? s.t}</span>
    </span>
  );
}

/* ---------- Chip (filter pill) ---------- */
function Chip({ active, children, onClick, tone = "default", size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]";
  const activeBg = {
    default: "bg-[#1D3A3A] border-[#2B5C58] text-[#7BE0D0]",
    amber:   "bg-[#3A2D15] border-[#6B4E1F] text-[#F0C670]",
    rose:    "bg-[#3A1A22] border-[#6B2B36] text-[#F08495]",
  }[tone];
  const base = active ? activeBg : "bg-[#152844] border-[#263858] text-[#B6C1DC] hover:border-[#2A3A5E]";
  return (
    <button onClick={onClick} className={`${base} ${pad} border rounded-md font-medium transition-colors`}>
      {children}
    </button>
  );
}

/* ---------- Button ---------- */
function Btn({ variant = "secondary", size = "md", children, icon, onClick, className = "", disabled }) {
  const sizes = {
    sm: "h-7 px-2.5 text-[12px] gap-1.5",
    md: "h-8 px-3 text-[12px] gap-1.5",
    lg: "h-10 px-4 text-[13px] gap-2",
  };
  const variants = {
    primary: "bg-[#1F6B62] hover:bg-[#247A70] text-white border border-[#2B8378]",
    secondary: "bg-[#152240] hover:bg-[#182C48] text-[#D5DCEC] border border-[#263858]",
    ghost: "bg-transparent hover:bg-[#152240] text-[#B6C1DC] border border-transparent",
    danger: "bg-[#3A1A22] hover:bg-[#4A1E29] text-[#F08495] border border-[#6B2B36]",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}>
      {icon && <span className="w-3.5 h-3.5">{icon}</span>}
      {children}
    </button>
  );
}

/* ---------- Window chrome (app shell for a desktop artboard) ---------- */
function AppWindow({ title, subtitle, rightMeta, children, width = 1440, height = 900 }) {
  return (
    <div className="relative flex flex-col bg-[#0D1629] text-[#E6ECF5] rounded-lg overflow-hidden"
         style={{ width, height, fontFamily: "Pretendard, system-ui, sans-serif" }}>
      {children}
    </div>
  );
}

/* ---------- Sidebar (rail) ---------- */
function Sidebar({ active = "dash", expanded = false }) {
  const items = [
    { id: "dash", label: "대시보드", icon: <Ic.Box className="w-full h-full"/> },
    { id: "wh",   label: "입출고 워크스테이션", icon: <Ic.Warehouse className="w-full h-full"/> },
    { id: "hist", label: "입출고 내역", icon: <Ic.History className="w-full h-full"/> },
    { id: "adm",  label: "관리자", icon: <Ic.Tool className="w-full h-full"/> },
  ];
  const w = expanded ? 220 : 56;
  return (
    <aside className="flex flex-col shrink-0 border-r border-[#1C2C4A] bg-[#0A1020]" style={{ width: w }}>
      <div className="h-12 flex items-center justify-center border-b border-[#1C2C4A]">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#1F6B62] to-[#0E2B28] flex items-center justify-center">
          <span className="text-[10px] font-bold text-[#7BE0D0] tracking-widest">X</span>
        </div>
        {expanded && <span className="ml-2 text-[12px] font-semibold tracking-widest text-[#B6C1DC]">X-RAY ERP</span>}
      </div>
      <nav className="flex-1 py-2 flex flex-col gap-0.5">
        {items.map(it => {
          const on = it.id === active;
          return (
            <button key={it.id}
              className={`mx-2 h-9 flex items-center rounded-md transition-colors ${on ? "bg-[#0F2D2A] text-[#7BE0D0]" : "text-[#6C7A99] hover:text-[#D5DCEC] hover:bg-[#152844]"}`}
              style={{ paddingLeft: expanded ? 10 : 0, justifyContent: expanded ? "flex-start" : "center" }}>
              <span className="w-4 h-4 shrink-0">{it.icon}</span>
              {expanded && <span className="ml-2.5 text-[12px]">{it.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="p-2 border-t border-[#1C2C4A] text-[10px] text-[#5A6785] text-center">
        {expanded ? "v1.4.0 · 2026.04" : "1.4"}
      </div>
    </aside>
  );
}

/* ---------- Top bar ---------- */
function TopBar({ title, subtitle, crumbs, meta, onToggleSidebar, onToggleRight }) {
  return (
    <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-[#1C2C4A] bg-[#0D1629]">
      <button onClick={onToggleSidebar} className="w-7 h-7 -ml-1 rounded-md flex items-center justify-center text-[#6C7A99] hover:text-[#D5DCEC] hover:bg-[#152844]">
        <Ic.Menu className="w-4 h-4"/>
      </button>
      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-[14px] font-semibold text-[#E6ECF5] truncate">{title}</h1>
        {subtitle && <span className="text-[11px] text-[#6C7A99] truncate">{subtitle}</span>}
      </div>
      {crumbs && <div className="text-[11px] text-[#6C7A99]">{crumbs}</div>}
      <div className="flex-1"/>
      {meta && <div className="text-[11px] text-[#8A97B3] flex items-center gap-3">{meta}</div>}
      <div className="flex items-center gap-1">
        <button className="w-7 h-7 rounded-md flex items-center justify-center text-[#6C7A99] hover:text-[#D5DCEC] hover:bg-[#152844]" title="새로고침">
          <Ic.Refresh className="w-3.5 h-3.5"/>
        </button>
        <button onClick={onToggleRight} className="w-7 h-7 rounded-md flex items-center justify-center text-[#6C7A99] hover:text-[#D5DCEC] hover:bg-[#152844]" title="상세 패널">
          <Ic.Panel className="w-3.5 h-3.5"/>
        </button>
        <div className="w-7 h-7 rounded-full bg-[#1D3A3A] text-[#7BE0D0] text-[11px] font-semibold flex items-center justify-center ml-1">관</div>
      </div>
    </header>
  );
}

/* ---------- KPI tile (also a filter button) ---------- */
function KPI({ label, value, sub, tone = "default", active, onClick }) {
  const tones = {
    default: { v: "#E6ECF5", dot: "#8A97B3" },
    ok:      { v: "#E6ECF5", dot: "#8A97B3" },
    low:     { v: "#E0A63C", dot: "#E0A63C" },
    out:     { v: "#E5576E", dot: "#E5576E" },
    accent:  { v: "#7BE0D0", dot: "#3BC5B4" },
  };
  const t = tones[tone];
  return (
    <button onClick={onClick}
      className={`group flex-1 text-left px-4 py-3 rounded-md border transition-all
        ${active ? "bg-[#152844] border-[#2B5C58]" : "bg-[#132240] border-[#1C2C4A] hover:border-[#263858]"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-[#8A97B3]">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.dot }}/>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight" style={{ color: t.v, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {sub && <span className="text-[10px] text-[#6C7A99]">{sub}</span>}
      </div>
    </button>
  );
}

/* ---------- Section wrapper ---------- */
function Section({ title, action, dense, children }) {
  return (
    <section className="flex flex-col min-h-0">
      {title && (
        <div className={`flex items-center gap-2 ${dense ? "pb-1.5" : "pb-2"}`}>
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-[#8A97B3] uppercase">{title}</h3>
          <div className="flex-1"/>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Search input ---------- */
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
