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
            <div className="grid grid-cols-4 gap-2">
              <KPI label="전체 건수" value={HISTORY.length} sub="필터 기준"/>
              <KPI label="입고 합계" value={`+${totalIn.toLocaleString()}`} sub="RECEIVE · PRODUCE" tone="accent"/>
              <KPI label="출고 합계" value={totalOut.toLocaleString()} sub="SHIP · BACKFLUSH" tone="out"/>
              <KPI label="오늘 건수" value={HISTORY.filter(h=>h.ts.startsWith("04/21")).length} sub="금일 거래"/>
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#132240] border border-[#1C2C4A]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#6C7A99] mr-1">유형</span>
                {["전체","입고","출고","조정","생산입고","자동차감"].map(t => {
                  const v = t === "전체" ? "all" : t;
                  return <Chip key={t} size="sm" active={typeFilter===v} onClick={() => setTypeFilter(v)}>{t}</Chip>;
                })}
              </div>
              <div className="w-px h-4 bg-[#263858]"/>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#6C7A99] mr-1">기간</span>
                {[["today","오늘"],["week","이번주"],["month","이번달"],["all","전체"]].map(([v,l]) =>
                  <Chip key={v} size="sm" active={rangeFilter===v} onClick={() => setRangeFilter(v)}>{l}</Chip>
                )}
              </div>
              <div className="flex-1"/>
              <div className="w-64"><SearchInput size="sm" value={q} onChange={setQ} placeholder="품명·코드·참조번호·메모"/></div>
              <Btn size="sm" variant="ghost" icon={<Ic.Download className="w-full h-full"/>}>엑셀 내보내기</Btn>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden">
              <div className="flex items-center gap-3 px-3 h-10 border-b border-[#1C2C4A]">
                <span className="text-[11px] font-semibold text-[#E6ECF5]">입출고 내역</span>
                <span className="text-[11px] text-[#6C7A99]">{filtered.length}건</span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px]" style={{fontVariantNumeric:"tabular-nums"}}>
                  <thead className="sticky top-0 bg-[#132240] z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-[#6C7A99] border-b border-[#1C2C4A]">
                      <th className="text-left font-medium px-3 py-2 w-28">일시</th>
                      <th className="text-left font-medium px-3 py-2 w-20">구분</th>
                      <th className="text-left font-medium px-3 py-2">품목명</th>
                      <th className="text-left font-medium px-3 py-2 w-28">코드</th>
                      <th className="text-left font-medium px-3 py-2 w-24">분류</th>
                      <th className="text-right font-medium px-3 py-2 w-20">수량</th>
                      <th className="text-right font-medium px-3 py-2 w-28">재고 변화</th>
                      <th className="text-left font-medium px-3 py-2 w-20">담당자</th>
                      <th className="text-left font-medium px-3 py-2 w-24">참조</th>
                      <th className="text-left font-medium px-3 py-2 w-32">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((h, idx) => {
                      const on = selected === h.code && idx === 0;
                      const typeColor = h.type === "입고" || h.type === "생산입고" ? "#4FB37A"
                                      : h.type === "출고" ? "#E5576E"
                                      : h.type === "자동차감" ? "#E0A63C"
                                      : "#B6C1DC";
                      return (
                        <tr key={h.ts+h.code} onClick={() => setSelected(h.code)}
                          className={`border-b border-[#182840] cursor-pointer ${on?"bg-[#172F4C]":"hover:bg-[#152844]"}`} style={{height:40}}>
                          <td className="px-3 font-mono text-[11px] text-[#B6C1DC]">{h.ts}</td>
                          <td className="px-3" style={{color: typeColor}}>{h.type}</td>
                          <td className="px-3 font-medium text-[#E6ECF5]">{h.name}</td>
                          <td className="px-3 font-mono text-[11px] text-[#B6C1DC]">{h.code}</td>
                          <td className="px-3"><span className="px-1.5 py-0.5 rounded bg-[#152844] border border-[#263858] text-[10px] text-[#B6C1DC]">{h.cat}</span></td>
                          <td className="px-3 text-right font-semibold" style={{color: h.qty>0?"#4FB37A":"#E5576E"}}>{h.qty>0?`+${h.qty}`:h.qty}</td>
                          <td className="px-3 text-right text-[#B6C1DC]">{h.from} <span className="text-[#5A6785]">→</span> <span className="text-[#E6ECF5] font-semibold">{h.to}</span></td>
                          <td className="px-3 text-[#B6C1DC]">{h.who}</td>
                          <td className="px-3 font-mono text-[11px] text-[#7BE0D0]">{h.ref}</td>
                          <td className="px-3 text-[#8A97B3] truncate">{h.memo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right detail */}
          {sel && (
            <aside className="w-[340px] shrink-0 border-l border-[#1C2C4A] bg-[#0E1A34] flex flex-col">
              <div className="px-4 pt-4 pb-3 border-b border-[#1C2C4A]">
                <div className="text-[10px] text-[#6C7A99] tracking-[0.14em] uppercase">거래 상세</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                        style={{background: sel.qty>0?"#15292A":"#2B1620", color: sel.qty>0?"#7BE0D0":"#F08495"}}>
                    {sel.type}
                  </span>
                  <span className="text-[20px] font-semibold" style={{color: sel.qty>0?"#4FB37A":"#E5576E", fontVariantNumeric:"tabular-nums"}}>
                    {sel.qty>0?`+${sel.qty}`:sel.qty}
                  </span>
                </div>
                <h2 className="mt-1 text-[16px] font-semibold">{sel.name}</h2>
                <div className="text-[11px] text-[#8A97B3] font-mono">{sel.code}</div>
              </div>

              <div className="flex-1 overflow-auto px-4 py-3">
                <dl className="text-[12px] divide-y divide-[#1C2C4A]">
                  <Row k="일시" v={<span className="font-mono">{sel.ts}</span>}/>
                  <Row k="담당자" v={sel.who}/>
                  <Row k="참조 번호" v={<span className="font-mono text-[#7BE0D0]">{sel.ref}</span>}/>
                  <Row k="재고 변화" v={<span>{sel.from} → <span className="font-semibold">{sel.to}</span></span>}/>
                  <Row k="분류" v={sel.cat}/>
                  <Row k="메모" v={<span className="text-[#B6C1DC]">{sel.memo}</span>}/>
                </dl>

                <div className="mt-5">
                  <div className="text-[10px] text-[#6C7A99] tracking-[0.14em] uppercase mb-2">관련 활동</div>
                  <ul className="text-[11px] space-y-2 text-[#B6C1DC]">
                    <li className="flex gap-2"><span className="font-mono text-[#6C7A99] w-16">04/21 01:28</span><span>{sel.who} 님이 출고 처리</span></li>
                    <li className="flex gap-2"><span className="font-mono text-[#6C7A99] w-16">04/21 01:27</span><span>QR 스캔으로 자재 인식</span></li>
                    <li className="flex gap-2"><span className="font-mono text-[#6C7A99] w-16">04/21 01:26</span><span>워크스테이션 A 접속</span></li>
                  </ul>
                </div>
              </div>

              <div className="p-3 border-t border-[#1C2C4A] flex gap-2">
                <Btn size="md" className="flex-1">되돌리기</Btn>
                <Btn size="md" className="flex-1">메모 편집</Btn>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

window.DeskHistory = DeskHistory;
