# IoBundleCard.tsx

## 이 파일은 뭐예요?
Step 4에서 묶음(IoBundle) 한 개를 파란색 카드로 렌더하는 컴포넌트입니다. BOM 묶음이면 상위 품목 헤더 + 접이식 하위 라인 목록을 보여주고, 낱개 단일 라인이면 카드 래퍼 없이 IoLineRow만 단독 노출합니다.

## 언제 보나요?
- Step 4(IoBundleCart) 내 각 묶음을 수량 조정할 때
- BOM 묶음의 기준 수량 stepper를 조작할 때 (하위 자재가 비례 연동)
- "창고에서 가져오기" 부족 라인 선택 기능이 활성인 생산(produce) 4단계

## 중요한 내용
- `IoBundleCard` — 주 export. `bundle.source_kind !== "bom_parent" && lines.length === 1` 이면 IoLineRow만 렌더
- `showBundleQtyStepper` — BOM 묶음에서 상위 라인 수량을 헤더에서 직접 조절하는 stepper 노출 조건
- `applyStepperQty` — 부모 라인 있으면 `onQuantityChange`로, 없으면 `onBundleQuantityChange`로 cascade
- `collapsed` 상태 — 헤더 클릭으로 하위 라인 목록 펼침/접힘 제어

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx]] — 이 컴포넌트를 묶음 목록으로 소비하는 컨테이너
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoLineRow.tsx]] — 낱개 분기 및 하위 라인 각 행 렌더
- [[ERP/frontend/app/mes/_components/_warehouse_v2/bomSync.ts]] — 수량 cascade 순수 로직 소스
