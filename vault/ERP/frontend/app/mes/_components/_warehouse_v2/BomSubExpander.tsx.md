# BomSubExpander.tsx

## 이 파일은 뭐예요?
품목 행 아래에 접이식 BOM 트리(하위 구성 읽기 전용)를 보여주는 컴포넌트입니다. 열릴 때 `api.getBOMTree(itemId)`를 한 번 호출해 자식 노드를 트리 선·엘보 형태로 렌더합니다.

## 언제 보나요?
- 입출고 위저드 Step 4 카트 라인 행에서 "하위 있음" 버튼을 누를 때 (IoLineRow)
- 대시보드 상세 패널의 BOM 트리 펼침 (`compact=true`)
- 모바일에서 품목명 탭으로 전체 이름을 펼칠 때 (`tapToExpandName=true`)

## 중요한 내용
- `BomSubExpander({ itemId, open, compact?, tapToExpandName? })` — 외부 export. `open=false`이면 null 반환
- `BomTreeItem` — 재귀 렌더. `rails: boolean[]` 배열로 각 depth의 수직선 표시 여부 결정
- `Rail` / `Connector` — SVG 없이 CSS로 트리 연결선 구현 (ROW_H=34px 고정)
- BOM 데이터는 마운트 후 최초 1회만 fetch (tree가 이미 있으면 재요청 없음)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoLineRow.tsx]] — BomSubExpander를 "하위 있음" 버튼과 함께 사용하는 호출처
- [[ERP/frontend/lib/api.ts]] — `api.getBOMTree`, `BOMTreeNode` 타입 제공
