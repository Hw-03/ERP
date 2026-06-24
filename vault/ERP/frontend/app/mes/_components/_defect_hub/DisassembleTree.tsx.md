# DisassembleTree.tsx

## 이 파일은 뭐예요?
PA/PF 불량 분해 처리 시 BOM 하위 품목별 "회수(정상)/격리" 수량을 결정하는 재귀 트리 컴포넌트다. 마운트 시 `deptAdjustmentApi.getBomTemplate`으로 자식 품목을 로드하고, 각 노드에서 keep_qty(회수량)를 조작한다.

## 언제 보나요?
- `PaPfDefectWizard`, `PaPfDefectWizardPanel`, `DefectProcessPanel`에서 분해 액션 선택 시
- BOM이 있는 격리 품목에만 표시됨

## 중요한 내용
- `ChildDecision` 인터페이스: `item_id, item_name, mes_code, qty, keep_qty, reason_memo, has_bom, children (null=미펼침), nodeMode ("whole"|"split")`
- `cascadeKeepQty()`: 부모 keep 비율을 자식 전체에 비례 전파 (manuallySet 행은 제외)
- `TreeNode` 내부 컴포넌트: 재귀 노드 행 렌더링, `nodeMode` 에 따라 "이 품목 통째로" / "하위 품목별 처리" 토글
- `validateDecisionTree(decisions)`: 모든 노드 keep_qty 범위 검사
- `toServerDecision(node)`: 트리 → 백엔드 `child_decisions` 페이로드 변환 (외부 export)
- 회수 외 잔량은 **폐기가 아니라 격리**로 이동 (yellow 색상으로 구분)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/PaPfDefectWizard.tsx]] — 모달에서 사용
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectProcessPanel.tsx]] — 전폭 패널에서 사용
- [[ERP/frontend/lib/api/dept-adjustment]] — `getBomTemplate` API (BOM 자식 lazy load)
- [[ERP/frontend/app/mes/_components/_defect_hub/InlineErrorNote.tsx]] — 로드 실패 에러 표시
