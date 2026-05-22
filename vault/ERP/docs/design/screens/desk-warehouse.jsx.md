---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/screens/desk-warehouse.jsx
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
# ... (이하 185줄 생략. 원본 참조)

````
