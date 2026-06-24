# WarehouseQueueRow.tsx

## 이 파일은 뭐예요?
창고 승인함·부서 결재함에서 재고 요청 한 건을 행으로 표시하고, 승인 또는 반려 인라인 폼을 조건부 렌더링하는 컴포넌트. 상태와 뮤테이터는 부모 패널에서 받는다.

## 언제 보나요?
- `WarehouseQueuePanel`과 `DepartmentQueuePanel`이 요청 목록을 렌더링할 때
- 결재자가 승인/반려 버튼을 클릭할 때 인라인 PIN 폼으로 전환됨

## 중요한 내용
- `WarehouseQueueRow(props: WarehouseQueueRowProps)` — 주요 export
- `WarehouseQueueRowProps` — 인터페이스 export. req·busyId·approvePinFor·approvePin·approveError·showRejectFor·rejectReason·rejectPin·rejectError 등 상태와 setter 포함
- `REQUEST_TYPE_LABEL` — `ioRequestLabels.ts`에서 가져와 요청 유형 레이블 표시
- `formatRequestNotes(req.notes)` — JSON 구조화 비고를 사람이 읽는 텍스트로 변환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseQueuePanel.tsx]] — 이 행을 사용하는 창고 승인함 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DepartmentQueuePanel.tsx]] — 이 행을 재사용하는 부서 결재함 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/ioRequestLabels.ts]] — `REQUEST_TYPE_LABEL`, `formatRequestNotes` 제공
