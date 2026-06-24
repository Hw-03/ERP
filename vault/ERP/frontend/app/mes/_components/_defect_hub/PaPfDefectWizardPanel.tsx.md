# PaPfDefectWizardPanel.tsx

## 이 파일은 뭐예요?
`PaPfDefectWizard`의 마스터-디테일 패널 버전이다. `createPortal` + fixed overlay 껍데기를 제거하고, 폼·검증·제출 로직(분해 트리 포함)은 100% 동일하게 보존한다. 데스크톱 마스터-디테일 레이아웃의 디테일 영역에서 사용된다.

## 언제 보나요?
- 데스크톱 불량 목록에서 PA/PF 항목을 선택해 우측 패널에 처리 폼이 표시될 때
- 다른 항목을 선택하면 `location` prop이 바뀌며 폼이 자동 초기화됨

## 중요한 내용
- `PaPfDefectWizardPanelProps`: `location`, `currentEmployee`, `onSubmitted`, `onClose`
- `location` 변경 감지 기준: `item_id + department + quantity` — 이 3개가 바뀔 때 폼 초기화
- `PaPfDefectWizard`와 API 호출 로직 동일 (unquarantine / defect_scrap / defect_disassemble)
- `ConfirmModal`은 여전히 모달 유지 (createPortal은 ConfirmModal 내부에서)
- 패널이므로 자체 scroll 영역(`flex-1 overflow-y-auto`) 보유

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/PaPfDefectWizard.tsx]] — 모달 버전 (동일 로직)
- [[ERP/frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx]] — BOM 분해 트리
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 폼
