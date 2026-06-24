# BomWorkbench.tsx

## 이 파일은 뭐예요?
BOM 관리 화면의 최상위 오케스트레이터 컴포넌트. 부서 탭, 부모 리스트, 자식 추가 박스, 현재 구성 패널, 사용처 패널, 미배치 원자재 서랍, 검토·완료 모달을 하나의 3-컬럼 레이아웃으로 조합하며, BOM CRUD(추가·수량 변경·삭제·완료 토글)와 JSON·CSV 내보내기 로직을 직접 소유한다.

## 언제 보나요?
- 관리자 화면에서 BOM(부모-자식 자재 구성) 편집 기능이 깨지거나 동작이 이상할 때
- "편집" ↔ "사용처" 모드 전환 흐름을 추적할 때
- BOM 내보내기(JSON+CSV)가 제대로 동작하지 않을 때

## 중요한 내용
- `Props`: `items`, `allBomRows`, `refreshAllBom`, `refreshItems`, `onStatusChange`, `onError`
- `Mode`: `"edit" | "whereused"` — 상단 토글 버튼으로 전환
- `completedSet`: `bom_completed_at` 있는 item_id Set (useMemo)
- `childCountMap`: 부모 → 자식 수 Map (useMemo, allBomRows 기반)
- `reloadBom()`: 낙관적 갱신 desync 방지용 서버 재동기화 함수
- `handleAdd / handleSaveQty / handleDeleteConfirm / handleToggleCompletion`: 각 CRUD 핸들러
- `exportCompletedBom()`: 완료된 BOM을 JSON·CSV로 동시 다운로드

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — 상태/필터 유틸
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomParentList.tsx]] — 좌측 부모 리스트
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx]] — 가운데 추가 패널
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomEditPanel.tsx]] — 우측 현재 구성
- [[ERP/frontend/lib/api.ts]] — `api.getBOM`, `api.createBOM`, `api.updateBOM`, `api.deleteBOM`, `api.updateBomCompletion`
