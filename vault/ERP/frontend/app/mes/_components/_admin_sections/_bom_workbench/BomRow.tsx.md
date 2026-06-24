# BomRow.tsx

## 이 파일은 뭐예요?
BOM 구성 리스트의 개별 행 컴포넌트. 자식 품목 배지·이름·코드를 표시하고 수량 클릭 시 인라인 input으로 전환해 Enter/blur 저장, Esc 취소를 처리한다. 삭제 버튼은 부모에서 ConfirmModal을 열도록 콜백을 호출한다.

## 언제 보나요?
- "현재 구성" 패널에서 수량 인라인 편집이 이상하게 동작할 때
- 삭제(소프트 삭제)된 자식 품목이 취소선으로 표시되는지 확인할 때

## 중요한 내용
- `Props`: `row: BOMEntry`, `childItem: Item | undefined`, `onSaveQty(bomId, qty)`, `onRequestDelete(row, childName)`
- 인라인 편집: `editing` 상태 토글, `parseFloat > 0` 검증, 같은 값이면 저장 스킵
- 삭제된 자식: `childItem?.deleted_at` 있으면 취소선 스타일(`isDeleted`)
- 수량 표시: `formatQty(row.quantity, { maximumFractionDigits: 2, trimTrailingZeros: true })`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomEditPanel.tsx]] — 이 행을 렌더하는 부모 패널
- [[ERP/frontend/lib/mes/format.ts]] — `formatQty`
