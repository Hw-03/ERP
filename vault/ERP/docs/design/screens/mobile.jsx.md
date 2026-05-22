---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/screens/mobile.jsx
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
# ... (이하 185줄 생략. 원본 참조)

````
