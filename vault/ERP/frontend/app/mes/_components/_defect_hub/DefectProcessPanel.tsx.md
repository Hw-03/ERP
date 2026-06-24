# DefectProcessPanel.tsx

## 이 파일은 뭐예요?
격리 항목 단건 처리를 위한 전폭 2단계 패널 컴포넌트다. Step 1에서 처리 수량·작업(정상복귀/재작업/전체폐기/반품)·사유를 선택하고, 재작업 선택 시 Step 2에서 `DisassembleTree`로 BOM 자식을 조작한 뒤 최종 처리한다.

## 언제 보나요?
- 데스크톱 불량 목록에서 [처리] 버튼 클릭 시 전폭 화면으로 전환됨
- 창고 격리 항목이면 "반품" 액션도 노출됨

## 중요한 내용
- `ProcessAction`: `"unquarantine" | "scrap" | "return" | "disassemble"`
- `isWarehouse`: `location.department === "창고"` — 반품 액션 노출 여부 결정
- `location.has_bom`: BOM 있는 품목이면 "재작업" 카드 표시 + Step 2 네비게이터 표시
- `ActionCard` 내부 컴포넌트: 카드형 작업 선택 UI (label, desc, color, selected)
- API 호출 분기: unquarantine → `defectsApi.unquarantine`, scrap/return → `createStockRequest`, disassemble → `createStockRequest({ notes: JSON.stringify({ child_decisions }) })`
- 재작업 분해 결정은 Step 2에서 `DisassembleTree`로 수집
- `ConfirmModal`: scrap/return에만 이중 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx]] — BOM 분해 트리 (Step 2)
- [[ERP/frontend/app/mes/_components/_defect_hub/InlineErrorNote.tsx]] — 에러 표시
- [[ERP/frontend/lib/api/defects]] — unquarantine API
- [[ERP/frontend/lib/api/stock-requests]] — defect_scrap / defect_return / defect_disassemble API
