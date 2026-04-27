---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-admin.jsx
status: active
updated: 2026-04-27
source_sha: 5300280ed883
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# desk-admin.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/screens/desk-admin.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `23388` bytes

## 연결

- Parent hub: [[docs/design/screens/screens|docs/design/screens]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 422줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Desktop — 관리자 워크스페이스
   좌측 접기 가능 섹션 네비 + 중앙 컨텐츠 + 우측 요약 패널
   섹션: 품목 / 직원 / BOM / 출하묶음 / 설정 */

function DeskAdmin() {
  const { ITEMS, EMPLOYEES } = window.ERP_DATA;
  const [section, setSection] = React.useState("item"); // item | emp | bom | pkg | setting
  const [navExpanded, setNavExpanded] = React.useState(true);
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState(ITEMS[0].code);
  const [itemQ, setItemQ] = React.useState("");

  const sections = [
    { id: "item", label: "품목", sub: "품목 기본 정보 수정", icon: <Ic.Box className="w-full h-full"/> },
    { id: "emp",  label: "직원", sub: "활성 상태 관리", icon: <Ic.People className="w-full h-full"/> },
    { id: "bom",  label: "BOM",  sub: "부모·자식 자재 구성", icon: <Ic.Sliders className="w-full h-full"/> },
    { id: "pkg",  label: "출하묶음", sub: "패키지 구성 관리", icon: <Ic.Package className="w-full h-full"/> },
    { id: "setting", label: "설정", sub: "PIN · CSV · 초기화", icon: <Ic.Tool className="w-full h-full"/> },
  ];

  return (
    <div className="flex w-full h-full bg-[#0D1629] text-[#E6ECF5]" style={{ fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <Sidebar active="adm" expanded={sidebarExpanded}/>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title="관리자 워크스페이스"
          subtitle="마스터 데이터 · 설정"
          meta={<><span className="flex items-center gap-1.5"><Ic.Lock className="w-3 h-3 text-[#7BE0D0]"/><span>관리자 잠금 해제됨</span></span><span className="text-[#3A5070]">|</span><span>품목 971건 / 직원 9명</span></>}
          onToggleSidebar={() => setSidebarExpanded(v => !v)}
        />

        <div className="flex flex-1 min-h-0">
          {/* Admin section nav */}
          <nav className={`shrink-0 bg-[#0E1A34] border-r border-[#1C2C4A] flex flex-col transition-all`} style={{ width: navExpanded ? 220 : 56 }}>
            <div className="h-10 px-3 flex items-center border-b border-[#1C2C4A]">
              {navExpanded && <span className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] flex-1">Admin Menu</span>}
              <button onClick={() => setNavExpanded(v => !v)} className="w-6 h-6 rounded text-[#6C7A99] hover:text-[#E6ECF5] hover:bg-[#152240] flex items-center justify-center">
                <Ic.Chevron className={`w-3.5 h-3.5 transition-transform ${navExpanded?"rotate-180":""}`}/>
              </button>
            </div>
            <div className="flex-1 py-2 flex flex-col gap-0.5">
              {sections.map(s => {
                const on = section === s.id;
                return (
                  <button key={s.id} onClick={() => setSection(s.id)}
                    className={`mx-2 rounded-md flex items-center transition-colors ${on?"bg-[#0F2D2A] text-[#7BE0D0]":"text-[#B6C1DC] hover:bg-[#152844]"}`}
                    style={{ height: 40, paddingLeft: navExpanded?10:0, justifyContent: navExpanded?"flex-start":"center" }}>
                    <span className="w-4 h-4 shrink-0">{s.icon}</span>
                    {navExpanded && (
                      <div className="ml-2.5 min-w-0 text-left">
                        <div className="text-[12px] font-medium truncate">{s.label}</div>
                        <div className={`text-[10px] truncate ${on?"text-[#4FB3A6]":"text-[#6C7A99]"}`}>{s.sub}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t border-[#1C2C4A]">
              <button className="w-full h-9 rounded-md bg-[#2B1620] border border-[#5A2733] text-[#F08495] text-[12px] font-medium hover:bg-[#3A1A22] flex items-center justify-center gap-1.5">
                <Ic.Lock className="w-3.5 h-3.5"/>
                {navExpanded && "관리자 잠금"}
              </button>
            </div>
          </nav>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
            {section === "item" && <AdminItems items={ITEMS} selected={selectedItem} setSelected={setSelectedItem} q={itemQ} setQ={setItemQ}/>}
            {section === "emp" && <AdminEmployees employees={EMPLOYEES}/>}
            {section === "bom" && <AdminBOM items={ITEMS}/>}
            {section === "pkg" && <AdminPackages/>}
            {section === "setting" && <AdminSettings/>}
          </div>

          {/* Right summary panel */}
          <aside className="w-[280px] shrink-0 border-l border-[#1C2C4A] bg-[#0E1A34] flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-[#1C2C4A]">
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99]">관리 요약</div>
              <h3 className="mt-1 text-[14px] font-semibold">현재 상태</h3>
            </div>
            <div className="p-4 space-y-3">
              <SummaryRow k="품목" v="971건"/>
              <SummaryRow k="직원" v="9명"/>
              <SummaryRow k="출하묶음" v="0건"/>
              <SummaryRow k="BOM" v="0건"/>
              <SummaryRow k="부서" v="10개"/>
            </div>
            <div className="px-4 py-3 border-t border-[#1C2C4A]">
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6C7A99] mb-2">최근 변경</div>
              <ul className="text-[11px] space-y-1.5 text-[#B6C1DC]">
                <li><span className="font-mono text-[#6C7A99]">04/21</span> · POWER LED 안전재고 수정</li>
                <li><span className="font-mono text-[#6C7A99]">04/20</span> · 오지훈 직원 활성</li>
                <li><span className="font-mono text-[#6C7A99]">04/19</span> · BOM DX3000 갱신</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ k, v }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-[#8A97B3]">{k}</span>
      <span className="font-semibold text-[#E6ECF5]" style={{fontVariantNumeric:"tabular-nums"}}>{v}</span>
    </div>
  );
}

/* ---------- 품목 ---------- */
function AdminItems({ items, selected, setSelected, q, setQ }) {
  const filtered = items.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.code.includes(q));
  const sel = items.find(i => i.code === selected) || filtered[0];
  return (
    <div className="flex gap-3 flex-1 min-h-0">
      <div className="w-[320px] shrink-0 flex flex-col rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden">
        <div className="p-3 border-b border-[#1C2C4A] space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold flex-1">품목 관리</h3>
            <span className="text-[11px] text-[#6C7A99]">{filtered.length}건</span>
          </div>
          <SearchInput size="sm" value={q} onChange={setQ} placeholder="품목명, 코드 검색"/>
          <Btn size="sm" variant="primary" icon={<Ic.Plus className="w-full h-full"/>} className="w-full">품목 추가</Btn>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.map(i => {
            const on = selected === i.code;
            return (
              <button key={i.code} onClick={() => setSelected(i.code)}
                className={`w-full text-left px-3 py-2 border-b border-[#182840] transition-colors ${on?"bg-[#172F4C]":"hover:bg-[#152844]"}`}>
                <div className="flex items-center gap-2">
                  <StatusDot status={i.status}/>
                  <span className="text-[12px] font-medium truncate flex-1">{i.name}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-[#6C7A99] font-mono">{i.code} · {i.model}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden flex flex-col">
        <div className="h-11 px-4 flex items-center gap-2 border-b border-[#1C2C4A]">
          <h3 className="text-[13px] font-semibold">{sel?.name}</h3>
          <span className="text-[11px] text-[#6C7A99] font-mono">{sel?.code}</span>
          <div className="flex-1"/>
          <Btn size="sm" variant="ghost">취소</Btn>
          <Btn size="sm" variant="primary">저장</Btn>
        </div>
        <div className="flex-1 overflow-auto p-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="품명" value={sel?.name}/>
          <Field label="ERP 코드" value={sel?.erp} mono/>
          <Field label="바코드" value={sel?.code} mono/>
          <Field label="단위" value={sel?.unit}/>
          <Field label="파일 구분" value={sel?.cat}/>
          <Field label="파트" value={sel?.part}/>
          <Field label="모델" value={sel?.model}/>
          <Field label="공급처" value={sel?.vendor}/>
          <Field label="위치" value={sel?.loc}/>
          <Field label="안전재고" value={sel?.safety} mono/>
          <Field label="사양" value="" multiline className="col-span-2"/>
          <Field label="비고" value="" multiline className="col-span-2"/>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, multiline, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] tracking-[0.08em] uppercase text-[#6C7A99]">{label}</span>
      {multiline ? (
        <textarea defaultValue={value} rows={3}
          className="mt-1 w-full rounded-md bg-[#0D1629] border border-[#1C2C4A] px-3 py-2 text-[12px] outline-none focus:border-[#2B5C58] resize-none"/>
      ) : (
        <input defaultValue={value}
          className={`mt-1 w-full h-9 rounded-md bg-[#0D1629] border border-[#1C2C4A] px-3 text-[13px] outline-none focus:border-[#2B5C58] ${mono?"font-mono":""}`}/>
      )}
    </label>
  );
}

/* ---------- 직원 ---------- */
function AdminEmployees({ employees }) {
  return (
    <div className="flex-1 rounded-md bg-[#132240] border border-[#1C2C4A] overflow-hidden flex flex-col">
      <div className="h-11 px-4 flex items-center gap-2 border-b border-[#1C2C4A]">
        <h3 className="text-[13px] font-semibold">직원 관리</h3>
        <span className="text-[11px] text-[#6C7A99]">{employees.length}명</span>
        <div className="flex-1"/>
        <Btn size="sm" variant="primary" icon={<Ic.Plus className="w-full h-full"/>}>직원 추가</Btn>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-[#132240] z-10">
            <tr className="text-[10px] uppercase tracking-wider text-[#6C7A99] border-b border-[#1C2C4A]">
              <th className="text-left font-medium px-4 py-2 w-16"></th>
              <th className="text-left font-medium px-4 py-2 w-24">사번</th>
              <th className="text-left font-medium px-4 py-2">이름</th>
              <th className="text-left font-medium px-4 py-2 w-32">부서</th>
              <th className="text-left font-medium px-4 py-2">역할</th>
              <th className="text-left font-medium px-4 py-2 w-24">상태</th>
              <th className="text-right font-medium px-4 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} className="border-b border-[#182840] hover:bg-[#152844]" style={{height:44}}>
                <td className="px-4">
                  <div className="w-7 h-7 rounded-full bg-[#192E4C] text-[11px] flex items-center justify-center text-[#B6C1DC] font-semibold">{e.short}</div>
                </td>
                <td className="px-4 font-mono text-[11px] text-[#B6C1DC]">{e.id}</td>
                <td className="px-4 font-medium">{e.name}</td>
                <td className="px-4 text-[#B6C1DC]">{e.dept}</td>
                <td className="px-4 text-[#8A97B3]">{e.role}</td>
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
