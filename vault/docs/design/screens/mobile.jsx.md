---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/mobile.jsx
status: active
updated: 2026-04-27
source_sha: ab67082ca0c2
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# mobile.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/screens/mobile.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `17824` bytes

## 연결

- Parent hub: [[docs/design/screens/screens|docs/design/screens]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 348줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Mobile — 재고 리스트, 창고 입출고, 관리자
   390x844 layout, touch-friendly */

function MobileShell({ title, subtitle, children, activeTab = "inv" }) {
  return (
    <div className="relative flex flex-col bg-[#0D1629] text-[#E6ECF5] overflow-hidden" style={{ width: 390, height: 844, fontFamily: "Pretendard, system-ui, sans-serif" }}>
      {/* status bar */}
      <div className="h-11 shrink-0 flex items-center justify-between px-6 text-[13px] font-semibold">
        <span>09:41</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">●●●●●</span>
          <svg viewBox="0 0 24 12" className="w-6 h-3"><rect x="1" y="2" width="20" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="22" y="5" width="1.5" height="2" fill="currentColor"/><rect x="3" y="4" width="16" height="4" fill="currentColor"/></svg>
        </div>
      </div>

      {/* header */}
      <div className="px-4 pb-3 shrink-0">
        <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99]">{title}</div>
        <h1 className="text-[22px] font-semibold tracking-tight">{subtitle}</h1>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</div>

      {/* bottom tab */}
      <nav className="h-16 shrink-0 border-t border-[#1C2C4A] bg-[#0A1020] grid grid-cols-4">
        {[
          { id: "inv", label: "재고", icon: <Ic.Box className="w-full h-full"/> },
          { id: "wh", label: "창고", icon: <Ic.Warehouse className="w-full h-full"/> },
          { id: "dept", label: "부서", icon: <Ic.People className="w-full h-full"/> },
          { id: "adm", label: "관리자", icon: <Ic.Lock className="w-full h-full"/> },
        ].map(t => {
          const on = activeTab === t.id;
          return (
            <button key={t.id} className={`flex flex-col items-center justify-center gap-0.5 ${on?"text-[#7BE0D0]":"text-[#6C7A99]"}`}>
              <span className="w-5 h-5">{t.icon}</span>
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ---------- 재고 ---------- */
function MobileInventory() {
  const { ITEMS, MODELS, CATEGORIES } = window.ERP_DATA;
  const [status, setStatus] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [model, setModel] = React.useState("all");

  const filtered = ITEMS.filter(i => {
    if (status !== "all" && i.status !== status) return false;
    if (cat !== "all" && i.cat !== cat) return false;
    if (model !== "all" && !i.model.startsWith(model)) return false;
    return true;
  });
  const counts = { all: 100, ok: 100, low: 0, out: 0 };

  return (
    <MobileShell title="INVENTORY" subtitle="재고" activeTab="inv">
      <div className="px-4 space-y-3 flex-1 overflow-auto pb-3">
        <div className="h-12 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center px-3 gap-2">
          <Ic.History className="w-4 h-4 text-[#6C7A99]"/>
          <span className="text-[13px] font-medium flex-1">입출고 이력 확인</span>
          <Ic.Chevron className="w-3.5 h-3.5 text-[#6C7A99]"/>
        </div>

        <div className="h-12 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center px-3 gap-2">
          <Ic.Search className="w-4 h-4 text-[#6C7A99]"/>
          <span className="text-[13px] text-[#5A6785] flex-1">품목명, 모델, 공급처, 코드 검색</span>
          <button className="w-7 h-7 rounded flex items-center justify-center bg-[#0D1629]"><Ic.QR className="w-3.5 h-3.5 text-[#7BE0D0]"/></button>
        </div>

        {/* status KPI row — tap to filter */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { id: "all", label: "전체", value: counts.all, tone: "default" },
            { id: "ok",  label: "정상", value: counts.ok, tone: "default" },
            { id: "low", label: "부족", value: counts.low, tone: "low" },
            { id: "out", label: "품절", value: counts.out, tone: "out" },
          ].map(k => {
            const on = status === k.id;
            const color = k.tone === "low" ? "#E0A63C" : k.tone === "out" ? "#E5576E" : "#E6ECF5";
            return (
              <button key={k.id} onClick={() => setStatus(k.id)}
                className={`h-16 rounded-md border px-2 text-left ${on?"bg-[#152844] border-[#2B5C58]":"bg-[#132240] border-[#1C2C4A]"}`}>
                <div className="text-[10px] text-[#8A97B3]">{k.label}</div>
                <div className="text-[18px] font-semibold" style={{color, fontVariantNumeric:"tabular-nums"}}>{k.value}</div>
              </button>
            );
          })}
        </div>

        {/* filters (horizontal scroll, larger taps) */}
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-1.5">구분</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
            <Chip active={cat==="all"} onClick={() => setCat("all")}>전체</Chip>
            {CATEGORIES.map(c => <Chip key={c} active={cat===c} onClick={() => setCat(c)}>{c}</Chip>)}
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-1.5">모델</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
            <Chip active={model==="all"} onClick={() => setModel("all")}>전체</Chip>
            {MODELS.map(m => <Chip key={m} active={model===m} onClick={() => setModel(m)}>{m}</Chip>)}
          </div>
        </div>

        {/* list */}
        <ul className="space-y-1.5">
          {filtered.slice(0, 6).map(i => (
            <li key={i.code} className="p-3 rounded-md bg-[#132240] border border-[#1C2C4A]">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <StatusDot status={i.status}/>
                    <span className="text-[10px] text-[#6C7A99]">{i.cat}</span>
                  </div>
                  <div className="text-[14px] font-semibold truncate">{i.name}</div>
                  <div className="text-[10px] text-[#6C7A99] font-mono mt-0.5">{i.code} · {i.part} · {i.model}</div>
                </div>
                <div className="text-right">
                  <div className={`text-[22px] font-semibold ${i.status==="out"?"text-[#E5576E]":i.status==="low"?"text-[#E0A63C]":"text-[#E6ECF5]"}`} style={{fontVariantNumeric:"tabular-nums"}}>{i.stock}</div>
                  <div className="text-[10px] text-[#6C7A99]">{i.unit}</div>
                </div>
              </div>
              {/* safety bar */}
              <div className="mt-2 h-1 rounded-full bg-[#1C2C4A] overflow-hidden">
                <div className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (i.stock / Math.max(i.safety||50, 1)) * 50)}%`,
                           background: i.status==="out"?"#E5576E":i.status==="low"?"#E0A63C":"#3BC5B4" }}/>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </MobileShell>
  );
}

/* ---------- 재고 상세 (bottom sheet) ---------- */
function MobileInventoryDetail() {
  const item = window.ERP_DATA.ITEMS[0];
  return (
    <MobileShell title="INVENTORY" subtitle="재고" activeTab="inv">
      {/* dim bg */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-black/60"/>
        <div className="absolute inset-x-0 bottom-0 bg-[#132240] rounded-t-2xl border-t border-[#263858] flex flex-col" style={{ maxHeight: "85%" }}>
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-[#2A3A5E]"/>
          </div>
          <div className="px-4 pb-3 border-b border-[#1C2C4A]">
            <div className="flex items-center gap-2">
              <StatusDot status={item.status}/>
              <span className="text-[10px] text-[#6C7A99] font-mono">{item.code}</span>
            </div>
            <h2 className="mt-1 text-[20px] font-semibold">{item.name}</h2>
            <div className="mt-0.5 text-[11px] text-[#8A97B3]">{item.cat} · {item.part} · {item.model}</div>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 gap-px bg-[#1C2C4A]">
              <Stat2 label="현재고" value={item.stock} unit={item.unit} big/>
              <Stat2 label="안전재고" value={item.safety||"—"} unit={item.unit} big/>
              <Stat2 label="가용 / 예약" value="200 / 0" unit={item.unit}/>
              <Stat2 label="위치" value={item.loc}/>
            </div>
            <dl className="text-[13px] divide-y divide-[#1C2C4A] px-4">
              <Row2 k="ERP 코드" v={<span className="font-mono text-[#7BE0D0]">{item.erp}</span>}/>
              <Row2 k="바코드" v={<span className="font-mono">{item.code}</span>}/>
              <Row2 k="모델" v={item.model}/>
              <Row2 k="공급처" v={item.vendor}/>
              <Row2 k="사양" v={<span className="text-[#6C7A99]">—</span>}/>
            </dl>
          </div>
          <div className="p-3 border-t border-[#1C2C4A] space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <TabBtn active>조정</TabBtn>
              <TabBtn>입고</TabBtn>
              <TabBtn>출고</TabBtn>
            </div>
            <div className="h-16 rounded-md bg-[#0D1629] border border-[#1C2C4A] flex items-center justify-center text-[32px] font-semibold" style={{fontVariantNumeric:"tabular-nums"}}>200</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[-10,-1,+1,+10].map(d => (
                <button key={d}
                  className={`h-12 rounded-md border text-[15px] font-semibold
                    ${d<0?"bg-[#2B1620] border-[#5A2733] text-[#F08495]":"bg-[#15292A] border-[#2B5C58] text-[#7BE0D0]"}`}>
                  {d>0?`+${d}`:d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
function Stat2({ label, value, unit, big }) {
  return (
    <div className="bg-[#132240] px-4 py-3">
      <div className="text-[10px] text-[#8A97B3]">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={big?"text-[24px] font-semibold":"text-[16px] font-semibold"} style={{fontVariantNumeric:"tabular-nums"}}>{value}</span>
        {unit && <span className="text-[10px] text-[#6C7A99]">{unit}</span>}
      </div>
    </div>
  );
}
function Row2({ k, v }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-[#8A97B3]">{k}</dt>
      <dd className="text-[#E6ECF5]">{v}</dd>
    </div>
  );
}
function TabBtn({ active, children }) {
  return (
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
