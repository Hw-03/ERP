# MobileDefectProcessPanel.tsx

## 이 파일은 뭐예요?
특정 불량 격리 위치 하나를 처리하는 모바일 전용 2단계 패널. Step 1에서 처리 작업(정상복귀·재작업·전체폐기·반품)과 수량·사유를 선택하고, `has_bom`일 때 재작업을 선택하면 Step 2에서 BOM 분해 트리(`DisassembleTree`)를 확인한 뒤 최종 제출한다.

## 언제 보나요?
- `DefectHubPanel`에서 불량 위치 항목을 탭해 처리 패널이 열릴 때
- 모바일 `MobileDefectScreen` 안에서 렌더됨

## 중요한 내용
- `MobileDefectProcessPanel({ location, currentEmployee, onDone, onCancel })` — 기본 export
- `ProcessAction` 타입: `"unquarantine" | "scrap" | "return" | "disassemble"`
- 반품(`return`)은 `location.department === "창고"`인 경우에만 선택지 노출
- 재작업(`disassemble`)은 `location.has_bom`인 경우에만 선택지 노출
- Step 2 진입 시 `DisassembleTree`로 BOM 자식 결정을 입력, `toServerDecision`으로 변환 후 `stockRequestsApi.createStockRequest` 호출
- 정상복귀는 `defectsApi.unquarantine`, 폐기·반품은 `stockRequestsApi.createStockRequest` (`defect_scrap`/`defect_return`)
- `ActionRow` — 내부 선택 카드 버튼 컴포넌트(로컬)
- 데스크톱 `DefectProcessPanel`과 동명 분리 정책 — 서로 건드리지 않음

## 위험도
🔴 높음 — 불량 격리 복귀·폐기·반품·재작업을 즉시 DB에 반영하는 API를 직접 호출하며, 일부 작업은 되돌릴 수 없음(scrap·disassemble).

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx]] — BOM 분해 결정 트리 UI
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 이 패널을 여는 허브
- [[ERP/frontend/lib/api/defects.ts]] — `defectsApi.unquarantine`
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stockRequestsApi.createStockRequest`
