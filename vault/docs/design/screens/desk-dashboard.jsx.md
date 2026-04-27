---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-dashboard.jsx
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
            title="대시보드"
            subtitle="재고 현황 · 자재 조회"
            meta={<><span>재고 {counts.total.toLocaleString()}건</span><span className="text-[#3A5070]">|</span><span>최종 동기화 04/21 02:14</span></>}
            onToggleSidebar={() => setSidebarExpanded(v => !v)}
            onToggleRight={() => setRightPanel(v => !v)}
          />

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
              {/* KPI row (also filters) */}
              <div className="flex gap-2">
                <KPI label="전체 품목" value={counts.total.toLocaleString()} sub={`총 재고 97,013`}
                     tone="default" active={statusFilter==="all"} onClick={() => setStatusFilter("all")}/>
                <KPI label="정상" value={counts.ok.toLocaleString()} sub="운영 가능 품목"
                     tone="default" active={statusFilter==="ok"} onClick={() => setStatusFilter("ok")}/>
                <KPI label="부족" value={counts.low} sub="안전재고 이하"
                     tone="low" active={statusFilter==="low"} onClick={() => setStatusFilter("low")}/>
                <KPI label="품절" value={counts.out} sub="즉시 확인 필요"
                     tone="out" active={statusFilter==="out"} onClick={() => setStatusFilter("out")}/>
                <div className="flex flex-col flex-1 px-4 py-3 rounded-md bg-[#132240] border border-[#1C2C4A]">
                  <div className="text-[11px] text-[#8A97B3]">BOM 기준 즉시 생산</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[22px] font-semibold text-[#7BE0D0]" style={{fontVariantNumeric:"tabular-nums"}}>47</span>
                    <span className="text-[10px] text-[#6C7A99]">DX3000 기준</span>
                  </div>
                </div>
                <div className="flex flex-col flex-1 px-4 py-3 rounded-md bg-[#132240] border border-[#1C2C4A]">
                  <div className="text-[11px] text-[#8A97B3]">최대 생산 가능</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[22px] font-semibold text-[#E6ECF5]" style={{fontVariantNumeric:"tabular-nums"}}>132</span>
                    <span className="text-[10px] text-[#6C7A99]">전 BOM 기준</span>
                  </div>
                </div>
              </div>

              {/* Filter bar */}
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
                <div className="flex items-center gap-1.5 text-[10px] text-[#6C7A99]">
                  <span>밀도</span>
                  {["compact","cozy","comfortable"].map(d => (
                    <button key={d} onClick={() => setDensity(d)}
                      className={`px-2 py-0.5 rounded border ${density===d?"border-[#2B5C58] text-[#7BE0D0] bg-[#0F2D2A]":"border-transparent text-[#6C7A99] hover:text-[#B6C1DC]"}`}>
                      {d==="compact"?"빽빽":d==="cozy"?"보통":"넉넉"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 min-h-0 flex flex-col rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden">
                <div className="flex items-center gap-3 px-3 h-10 border-b border-[#1C2C4A]">
                  <div className="flex-1 max-w-md">
                    <SearchInput size="sm" value={q} onChange={setQ} placeholder="품목명, ERP코드, 코드, 위치, 공급처 검색"/>
                  </div>
                  <span className="text-[11px] text-[#6C7A99]">{filtered.length.toLocaleString()}건</span>
                  <div className="flex-1"/>
                  <Btn size="sm" variant="ghost" icon={<Ic.Download className="w-full h-full"/>}>엑셀</Btn>
                  <Btn size="sm" variant="ghost" icon={<Ic.Sliders className="w-full h-full"/>}>컬럼</Btn>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-[12px]" style={{fontVariantNumeric:"tabular-nums"}}>
                    <thead className="sticky top-0 bg-[#132240] z-10">
                      <tr className="text-[10px] uppercase tracking-wider text-[#6C7A99] border-b border-[#1C2C4A]">
                        <th className="text-left font-medium px-3 py-2 w-16">상태</th>
                        <th className="text-left font-medium px-3 py-2">품목명</th>
                        <th className="text-left font-medium px-3 py-2 w-28">ERP 코드</th>
                        <th className="text-left font-medium px-3 py-2 w-28">코드</th>
                        <th className="text-left font-medium px-3 py-2 w-24">구분</th>
                        <th className="text-left font-medium px-3 py-2 w-24">파트</th>
                        <th className="text-right font-medium px-3 py-2 w-20">현재고</th>
                        <th className="text-right font-medium px-3 py-2 w-20">안전재고</th>
                        <th className="text-left font-medium px-3 py-2 w-32">모델</th>
                        <th className="text-left font-medium px-3 py-2 w-20">위치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(i => {
                        const on = selected === i.code;
                        return (
                          <tr key={i.code} onClick={() => setSelected(i.code)}
                            className={`border-b border-[#182840] cursor-pointer transition-colors ${on ? "bg-[#172F4C]" : "hover:bg-[#152844]"}`}
                            style={{ height: rowH }}>
                            <td className="px-3"><StatusDot status={i.status}/></td>
                            <td className="px-3 font-medium text-[#E6ECF5]">{i.name}</td>
                            <td className="px-3 text-[#7BE0D0] font-mono text-[11px]">{i.erp}</td>
                            <td className="px-3 text-[#B6C1DC] font-mono text-[11px]">{i.code}</td>
                            <td className="px-3 text-[#B6C1DC]">{i.cat}</td>
                            <td className="px-3 text-[#B6C1DC]">{i.part}</td>
                            <td className={`px-3 text-right font-semibold ${i.status==="out"?"text-[#E5576E]":i.status==="low"?"text-[#E0A63C]":"text-[#E6ECF5]"}`}>{i.stock}</td>
                            <td className="px-3 text-right text-[#6C7A99]">{i.safety || "—"}</td>
                            <td className="px-3 text-[#B6C1DC]">{i.model}</td>
                            <td className="px-3 text-[#B6C1DC]">{i.loc}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="h-8 border-t border-[#1C2C4A] flex items-center px-3 text-[10px] text-[#6C7A99] gap-3">
                  <span>{filtered.length.toLocaleString()}건 / 전체 {counts.total.toLocaleString()}</span>
                  <span>·</span>
                  <span>키보드 ↑↓ 탐색, Enter 선택, E 편집</span>
                  <div className="flex-1"/>
                  <span>정렬: 코드 오름차순</span>
                </div>
              </div>
            </div>

            {/* Right detail panel */}
            {rightPanel && sel && (
              <aside className="w-[360px] shrink-0 border-l border-[#1C2C4A] bg-[#0E1A34] flex flex-col">
                <div className="px-4 pt-4 pb-3 border-b border-[#1C2C4A]">
                  <div className="flex items-center gap-2">
                    <StatusDot status={sel.status}/>
                    <span className="text-[10px] text-[#6C7A99] font-mono">{sel.code}</span>
                    <div className="flex-1"/>
                    <button className="w-6 h-6 rounded text-[#6C7A99] hover:text-[#E6ECF5] hover:bg-[#152240] flex items-center justify-center" onClick={() => setRightPanel(false)}>
                      <Ic.Close className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-[#E6ECF5]">{sel.name}</h2>
                  <div className="mt-0.5 text-[11px] text-[#8A97B3]">{sel.cat} · {sel.part} · {sel.model}</div>
                </div>

                <div className="flex-1 overflow-auto">
                  <div className="grid grid-cols-2 gap-px bg-[#1C2C4A]">
                    <Stat label="현재고" value={sel.stock} unit={sel.unit}
                          tone={sel.status}/>
                    <Stat label="안전재고" value={sel.safety || "—"} unit={sel.unit}/>
                    <Stat label="가용" value={sel.stock} unit={sel.unit} small/>
                    <Stat label="예약" value={0} unit={sel.unit} small/>
                  </div>

                  <div className="px-4 pt-4 pb-2">
                    <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">품목 정보</div>
                    <dl className="text-[12px] divide-y divide-[#1C2C4A]">
                      <Row k="ERP 코드" v={<span className="font-mono text-[#7BE0D0]">{sel.erp}</span>}/>
                      <Row k="바코드" v={<span className="font-mono">{sel.code}</span>}/>
                      <Row k="위치" v={sel.loc}/>
                      <Row k="파트" v={sel.part}/>
                      <Row k="모델" v={sel.model}/>
                      <Row k="단위" v={sel.unit}/>
                      <Row k="공급처" v={sel.vendor}/>
                      <Row k="사양" v={<span className="text-[#6C7A99]">—</span>}/>
                    </dl>
                  </div>

                  <div className="px-4 py-3 border-t border-[#1C2C4A]">
                    <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">최근 이력</div>
                    <ul className="text-[12px] space-y-1.5">
                      <HistRow ts="04/21 00:38" type="입고" qty="+100" who="문현우"/>
                      <HistRow ts="04/15 11:22" type="출고" qty="-20"  who="김준우"/>
                      <HistRow ts="04/12 09:05" type="조정" qty="+5"   who="한유진"/>
                    </ul>
                  </div>
                </div>

                <div className="p-3 border-t border-[#1C2C4A] flex gap-2">
                  <Btn variant="primary" size="md" className="flex-1" icon={<Ic.Plus className="w-full h-full"/>}>입고</Btn>
                  <Btn size="md" className="flex-1" icon={<Ic.Minus className="w-full h-full"/>}>출고</Btn>
                  <Btn size="md" icon={<Ic.Sliders className="w-full h-full"/>}>조정</Btn>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
