# IoLineRow.tsx

## 이 파일은 뭐예요?
입출고 카트(Step 4) 내 개별 라인 한 행을 렌더하는 컴포넌트입니다. 체크박스·품목명·수량 stepper(-10/-1/입력/+1/+10)·현재 재고·실행 후 재고·삭제 버튼 7열로 구성되며, 재고 부족 시 행 배경이 붉게 변하고 "창고에서 가져오기" 버튼이 나타납니다.

## 언제 보나요?
- Step 4(IoBundleCart → IoBundleCard) 내 각 라인을 수량 조정할 때
- BOM 강제 모드(produce/disassemble)에서 하위 자재 라인이 잠겨 있을 때
- 재고 부족 라인에서 "창고에서 가져오기" 선택 체크박스가 보일 때

## 중요한 내용
- `IoLineRow` — 주 export. `pullSelectable`/`pullSelected`/`onTogglePull` props로 창고 가져오기 기능 제어
- `isOutgoing(line)` — 출고 방향 여부 판별 (재고 열 레이블 "가능 재고" vs "현재 재고")
- `expectedAfter(line, available)` — 작업 후 예상 재고 계산 (순수 함수, export)
- `qtyLocked` — `isBomForced(subType) && origin === "bom_auto"` 일 때 stepper 비활성
- `BomSubExpander` — `line.has_children` 일 때 하위 BOM 접이식 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx]] — 이 컴포넌트를 라인 목록으로 렌더하는 묶음 카드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `isBomForced`, `lineTagLabel` 등 로직 소스
- [[ERP/frontend/app/mes/_components/_warehouse_v2/BomSubExpander.tsx]] — 하위 BOM 트리 표시 컴포넌트
