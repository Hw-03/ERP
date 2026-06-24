# PaPfDefectWizard.tsx

## 이 파일은 뭐예요?
PA/PF(분해 가능한 조립품) 격리 항목을 처리하는 모달 컴포넌트다. "정상 복귀 / 전부 폐기(BOM 통째) / 분해+자식 처리" 3가지 액션 중 선택하고, 분해 선택 시 `DisassembleTree`로 BOM 하위 트리를 조작한다.

## 언제 보나요?
- 격리 목록에서 PA 또는 PF 품목의 [처리] 버튼을 눌렀을 때 (모달 경로)
- `createPortal`로 `document.body`에 렌더, z-index 400

## 중요한 내용
- `DisposalAction`: `"unquarantine" | "scrap" | "disassemble"`
- `processQty`: 격리 수량 중 처리할 수량 (1 ~ location.quantity 범위)
- 분해 선택 시 `DisassembleTree` 표시 → `ChildDecision[]` 결정 수집
- API 호출 분기:
  - unquarantine → `defectsApi.unquarantine` (즉시)
  - scrap → `stockRequestsApi.createStockRequest({ request_type: "defect_scrap" })`
  - disassemble → `createStockRequest({ request_type: "defect_disassemble", notes: JSON.stringify({ child_decisions }) })`
- 폐기·분해는 `ConfirmModal` (tone="danger") 이중 확인 필요

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx]] — BOM 분해 결정 트리
- [[ERP/frontend/app/mes/_components/_defect_hub/PaPfDefectWizardPanel.tsx]] — 동일 로직의 마스터-디테일 패널 버전
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 폼
- [[ERP/frontend/lib/api/defects]] — unquarantine API
