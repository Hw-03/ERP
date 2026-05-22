---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/screens/desk-admin.jsx
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
# ... (이하 185줄 생략. 원본 참조)

````
