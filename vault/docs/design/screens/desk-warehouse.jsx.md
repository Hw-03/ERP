---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-warehouse.jsx
status: active
updated: 2026-04-27
source_sha: c334addf15d7
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# desk-warehouse.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/screens/desk-warehouse.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `14233` bytes

## 연결

- Parent hub: [[docs/design/screens/screens|docs/design/screens]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 237줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Desktop — 입출고 워크스테이션
   좌: 필터 + 자재 목록 / 우: 작업 유형, 담당, 수량, 메모, 액션 */

function DeskWarehouse() {
  const { ITEMS, MODELS, CATEGORIES, EMPLOYEES } = window.ERP_DATA;
  const [q, setQ] = React.useState("");
  const [modelFilter, setModelFilter] = React.useState("all");
  const [catFilter, setCatFilter] = React.useState("all");
  const [opType, setOpType] = React.useState("receive"); // receive | transfer | dept | package | in | out
  const [picked, setPicked] = React.useState([
    { code: "AA-000001", qty: 20 },
    { code: "AA-000004", qty: 5 },
  ]);
  const [selectedEmp, setSelectedEmp] = React.useState("E001");
  const [qty, setQty] = React.useState(1);
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false);

  const filtered = ITEMS.filter(i => {
    if (modelFilter !== "all" && !i.model.startsWith(modelFilter)) return false;
    if (catFilter !== "all" && i.cat !== catFilter) return false;
    if (q && !(i.name.toLowerCase().includes(q.toLowerCase()) || i.code.includes(q))) return false;
    return true;
  });

  const ops = [
    { id: "receive", label: "원자재 입고", icon: <Ic.Plus className="w-full h-full"/> },
    { id: "transfer", label: "창고 이동", icon: <Ic.ArrowRight className="w-full h-full"/> },
    { id: "dept",     label: "부서 입출고", icon: <Ic.People className="w-full h-full"/> },
    { id: "package",  label: "패키지 출고", icon: <Ic.Package className="w-full h-full"/> },
    { id: "in",       label: "창고 입고", icon: <Ic.Warehouse className="w-full h-full"/> },
    { id: "out",      label: "창고 출고", icon: <Ic.Warehouse className="w-full h-full"/> },
  ];

  return (
    <div className="flex w-full h-full bg-[#0D1629] text-[#E6ECF5]" style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <Sidebar active="wh" expanded={sidebarExpanded}/>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title="입출고 워크스테이션"
          subtitle="원자재 입고 · 부서 입출고 · 패키지"
          meta={<><span>입출고 준비 완료</span><span className="text-[#3A5070]">|</span><span>직원 9명 / 품목 971건</span></>}
          onToggleSidebar={() => setSidebarExpanded(v => !v)}
        />

        <div className="flex flex-1 min-h-0">
          {/* Left: filters + table */}
          <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
            {/* Combined filter bar (collapsed into one row) */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#132240] border border-[#1C2C4A]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#6C7A99] mr-1">파일 구분</span>
                <Chip active={catFilter==="all"} onClick={() => setCatFilter("all")} size="sm">전체</Chip>
                {CATEGORIES.map(c => <Chip key={c} size="sm" active={catFilter===c} onClick={() => setCatFilter(c)}>{c}</Chip>)}
              </div>
              <div className="w-px h-4 bg-[#263858]"/>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#6C7A99] mr-1">모델</span>
                <Chip active={modelFilter==="all"} onClick={() => setModelFilter("all")} size="sm">전체</Chip>
                {MODELS.map(m => <Chip key={m} size="sm" active={modelFilter===m} onClick={() => setModelFilter(m)}>{m}</Chip>)}
              </div>
              <div className="flex-1"/>
              <Btn size="sm" variant="ghost" icon={<Ic.QR className="w-full h-full"/>}>QR 스캔</Btn>
            </div>

            {/* Table card */}
            <div className="flex-1 min-h-0 flex flex-col rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden">
              <div className="flex items-center gap-3 px-3 h-10 border-b border-[#1C2C4A]">
                <div className="flex-1 max-w-md">
                  <SearchInput size="sm" value={q} onChange={setQ} placeholder="품목명, 코드, 바코드 검색"/>
                </div>
                <span className="text-[11px] text-[#6C7A99]">{filtered.length}건</span>
                <div className="flex-1"/>
                <span className="text-[11px] text-[#7BE0D0]">선택 {picked.length}건</span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px]" style={{fontVariantNumeric:"tabular-nums"}}>
                  <thead className="sticky top-0 bg-[#132240] z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-[#6C7A99] border-b border-[#1C2C4A]">
                      <th className="text-left font-medium px-3 py-2 w-10"></th>
                      <th className="text-left font-medium px-3 py-2 w-16">상태</th>
                      <th className="text-left font-medium px-3 py-2">품목명</th>
                      <th className="text-left font-medium px-3 py-2 w-28">코드</th>
                      <th className="text-left font-medium px-3 py-2 w-24">구분</th>
                      <th className="text-right font-medium px-3 py-2 w-20">현재고</th>
                      <th className="text-left font-medium px-3 py-2 w-28">모델</th>
                      <th className="text-right font-medium px-3 py-2 w-20">수량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 12).map(i => {
                      const p = picked.find(x => x.code === i.code);
                      const on = !!p;
                      return (
                        <tr key={i.code}
                          className={`border-b border-[#182840] transition-colors ${on ? "bg-[#172F4C]" : "hover:bg-[#152844]"}`}
                          style={{ height: 40 }}>
                          <td className="px-3">
                            <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${on?"bg-[#1F6B62] border-[#2B8378]":"border-[#2A3A5E]"}`}>
                              {on && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>}
                            </div>
                          </td>
                          <td className="px-3"><StatusDot status={i.status}/></td>
                          <td className="px-3 font-medium text-[#E6ECF5]">{i.name}</td>
                          <td className="px-3 text-[#B6C1DC] font-mono text-[11px]">{i.code}</td>
                          <td className="px-3 text-[#B6C1DC]">{i.cat}</td>
                          <td className={`px-3 text-right font-semibold ${i.status==="out"?"text-[#E5576E]":i.status==="low"?"text-[#E0A63C]":"text-[#E6ECF5]"}`}>{i.stock}</td>
                          <td className="px-3 text-[#B6C1DC]">{i.model}</td>
                          <td className="px-3 text-right">
                            {on ? <span className="text-[#7BE0D0] font-semibold">{p.qty}</span> : <span className="text-[#5A6785]">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: action panel */}
          <aside className="w-[380px] shrink-0 border-l border-[#1C2C4A] bg-[#0E1A34] flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-[#1C2C4A]">
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99]">작업 유형</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ops.map(o => {
                  const on = opType === o.id;
                  return (
                    <button key={o.id} onClick={() => setOpType(o.id)}
                      className={`h-9 px-2 flex items-center gap-2 rounded-md border text-[12px] transition-colors
                        ${on ? "bg-[#0F2D2A] border-[#2B5C58] text-[#7BE0D0]" : "bg-[#132240] border-[#1C2C4A] text-[#B6C1DC] hover:border-[#263858]"}`}>
                      <span className="w-3.5 h-3.5">{o.icon}</span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-3 border-b border-[#1C2C4A]">
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">경로</div>
              <div className="flex items-center gap-2 text-[12px]">
                <div className="flex-1 h-8 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center gap-2 px-2.5">
                  <Ic.Warehouse className="w-3.5 h-3.5 text-[#6C7A99]"/>
                  <span>창고</span>
                </div>
                <Ic.ArrowRight className="w-3.5 h-3.5 text-[#6C7A99]"/>
                <div className="flex-1 h-8 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center gap-2 px-2.5">
                  <Ic.Tool className="w-3.5 h-3.5 text-[#6C7A99]"/>
                  <span>생산부</span>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-[#1C2C4A]">
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">담당 직원</div>
              <div className="flex gap-1.5 flex-wrap">
                {EMPLOYEES.slice(0,6).map(e => {
                  const on = e.id === selectedEmp;
                  return (
                    <button key={e.id} onClick={() => setSelectedEmp(e.id)}
                      className={`h-9 px-2 rounded-md flex items-center gap-1.5 border text-[11px]
                        ${on ? "bg-[#0F2D2A] border-[#2B5C58] text-[#7BE0D0]" : "bg-[#132240] border-[#1C2C4A] text-[#B6C1DC] hover:border-[#263858]"}`}>
                      <span className="w-5 h-5 rounded-full bg-[#192E4C] flex items-center justify-center text-[10px] font-semibold">{e.short}</span>
                      <span>{e.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-3 flex-1 overflow-auto">
              <div className="flex items-center mb-2">
                <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99]">선택 자재</div>
                <div className="flex-1"/>
                <span className="text-[11px] text-[#8A97B3]">{picked.length}건</span>
              </div>
              <ul className="space-y-1.5">
                {picked.map(p => {
                  const it = ITEMS.find(i => i.code === p.code);
                  return (
                    <li key={p.code} className="flex items-center gap-2 px-2.5 h-10 rounded-md bg-[#132240] border border-[#1C2C4A]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-[#E6ECF5] truncate font-medium">{it?.name}</div>
                        <div className="text-[10px] text-[#6C7A99] font-mono">{p.code}</div>
                      </div>
                      <input defaultValue={p.qty} className="w-14 h-7 rounded bg-[#0D1629] border border-[#263858] text-right px-2 text-[12px] font-semibold text-[#E6ECF5] outline-none focus:border-[#2B5C58]" style={{fontVariantNumeric:"tabular-nums"}}/>
                      <span className="text-[10px] text-[#6C7A99]">EA</span>
                      <button className="w-6 h-6 text-[#6C7A99] hover:text-[#E5576E]"><Ic.Close className="w-3.5 h-3.5"/></button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3">
                <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">수량 조정 (선택 행)</div>
                <div className="h-14 rounded-md bg-[#132240] border border-[#1C2C4A] flex items-center justify-center text-[28px] font-semibold" style={{fontVariantNumeric:"tabular-nums"}}>{qty}</div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[-10,-1,+1,+10].map(d => (
                    <button key={d} onClick={() => setQty(v => Math.max(0, v+d))}
                      className={`h-9 rounded-md border text-[13px] font-semibold
                        ${d<0 ? "bg-[#2B1620] border-[#5A2733] text-[#F08495] hover:bg-[#3A1A22]"
                             : "bg-[#15292A] border-[#2B5C58] text-[#7BE0D0] hover:bg-[#1A3434]"}`}>
                      {d>0?`+${d}`:d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-[10px] text-[#6C7A99]">참조 번호</label>
                  <input placeholder="PO-2041 / WO-0315"
                    className="mt-1 w-full h-8 rounded-md bg-[#132240] border border-[#1C2C4A] px-2.5 text-[12px] outline-none focus:border-[#2B5C58]"/>
                </div>
                <div>
                  <label className="text-[10px] text-[#6C7A99]">메모</label>
                  <textarea placeholder="메모 입력" rows={2}
                    className="mt-1 w-full rounded-md bg-[#132240] border border-[#1C2C4A] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#2B5C58] resize-none"/>
                </div>
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
