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
    <button className={`h-11 rounded-md border text-[13px] font-semibold ${active?"bg-[#0F2D2A] border-[#2B5C58] text-[#7BE0D0]":"bg-[#0D1629] border-[#1C2C4A] text-[#B6C1DC]"}`}>
      {children}
    </button>
  );
}

/* ---------- 창고 입출고 ---------- */
function MobileWarehouse() {
  const { EMPLOYEES, ITEMS } = window.ERP_DATA;
  return (
    <MobileShell title="WAREHOUSE" subtitle="창고 입출고" activeTab="wh">
      <div className="px-4 space-y-3 flex-1 overflow-auto pb-3">
        <div className="h-12 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center px-3 gap-2">
          <Ic.History className="w-4 h-4 text-[#6C7A99]"/>
          <span className="text-[13px] font-medium flex-1">입출고 내역 확인</span>
          <Ic.Chevron className="w-3.5 h-3.5 text-[#6C7A99]"/>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-1.5">이동 유형</div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "창고 → 생산부", on: true },
              { label: "생산부 → 창고" },
              { label: "창고 입고" },
            ].map((o, i) => (
              <button key={i} className={`h-16 rounded-md border flex flex-col items-center justify-center gap-1 text-[11px] font-medium
                ${o.on?"bg-[#0F2D2A] border-[#2B5C58] text-[#7BE0D0]":"bg-[#132240] border-[#1C2C4A] text-[#B6C1DC]"}`}>
                <Ic.Warehouse className="w-4 h-4"/>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-11 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center gap-2 px-3 text-[13px]">
            <Ic.Warehouse className="w-4 h-4 text-[#6C7A99]"/><span>창고</span>
          </div>
          <Ic.ArrowRight className="w-3.5 h-3.5 text-[#6C7A99]"/>
          <div className="flex-1 h-11 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center gap-2 px-3 text-[13px]">
            <Ic.Tool className="w-4 h-4 text-[#6C7A99]"/><span>생산부</span>
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-1.5">담당 직원</div>
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
            {EMPLOYEES.slice(0,6).map((e, i) => (
              <button key={e.id} className={`shrink-0 w-14 flex flex-col items-center gap-1 ${i===0?"text-[#7BE0D0]":"text-[#B6C1DC]"}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-semibold border-2 ${i===0?"bg-[#0F2D2A] border-[#2B5C58]":"bg-[#132240] border-transparent"}`}>{e.short}</div>
                <span className="text-[10px]">{e.name}</span>
              </button>
            ))}
          </div>
        </div>

        <button className="w-full h-14 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center gap-3 px-4">
          <div className="w-9 h-9 rounded-md bg-[#0F2D2A] border border-[#2B5C58] flex items-center justify-center"><Ic.QR className="w-4 h-4 text-[#7BE0D0]"/></div>
          <div className="flex-1 text-left">
            <div className="text-[13px] font-semibold">QR 스캔</div>
            <div className="text-[10px] text-[#6C7A99]">카메라로 상품 인식</div>
          </div>
          <Ic.Chevron className="w-3.5 h-3.5 text-[#6C7A99]"/>
        </button>

        <div className="text-center text-[10px] text-[#6C7A99]">또는 직접 선택</div>

        <div className="h-11 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center px-3 gap-2">
          <Ic.Search className="w-4 h-4 text-[#6C7A99]"/>
          <span className="text-[13px] text-[#5A6785] flex-1">품명 검색</span>
        </div>

        <ul className="space-y-1.5">
          {ITEMS.slice(0,3).map(i => (
            <li key={i.code} className="h-14 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center px-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{i.name}</div>
                <div className="text-[10px] text-[#6C7A99] font-mono">{i.code}</div>
              </div>
              <div className="text-right">
                <span className="text-[15px] font-semibold text-[#7BE0D0]" style={{fontVariantNumeric:"tabular-nums"}}>{i.stock}</span>
                <span className="text-[10px] text-[#6C7A99] ml-1">EA</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </MobileShell>
  );
}

/* ---------- 관리자 PIN ---------- */
function MobileAdminPin() {
  return (
    <MobileShell title="ADMIN" subtitle="관리자" activeTab="adm">
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-14 h-14 rounded-xl bg-[#0F2D2A] border border-[#2B5C58] flex items-center justify-center">
          <Ic.Lock className="w-6 h-6 text-[#7BE0D0]"/>
        </div>
        <div className="text-center">
          <div className="text-[10px] tracking-[0.2em] uppercase text-[#7BE0D0] mb-1">Admin Access</div>
          <h3 className="text-[20px] font-semibold">관리자 잠금 해제</h3>
          <p className="mt-2 text-[12px] text-[#8A97B3] max-w-[240px] mx-auto">관리자 PIN을 입력하면 설정과 마스터 데이터를 수정할 수 있습니다.</p>
        </div>
        <div className="flex gap-2">
          {[true, true, false, false].map((on, i) =>
            <span key={i} className={`w-3 h-3 rounded-full ${on?"bg-[#7BE0D0]":"bg-[#263858]"}`}/>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="h-16 rounded-lg bg-[#132240] border border-[#1C2C4A] text-[22px] font-semibold hover:bg-[#172C48]">{n}</button>
          ))}
          <div/>
          <button className="h-16 rounded-lg bg-[#132240] border border-[#1C2C4A] text-[22px] font-semibold">0</button>
          <button className="h-16 rounded-lg bg-[#0D1629] border border-[#1C2C4A] text-[13px] text-[#B6C1DC]">삭제</button>
        </div>
      </div>
    </MobileShell>
  );
}

window.MobileInventory = MobileInventory;
window.MobileInventoryDetail = MobileInventoryDetail;
window.MobileWarehouse = MobileWarehouse;
window.MobileAdminPin = MobileAdminPin;
