# DesktopHistoryRightPanel.tsx

## 이 파일은 뭐예요?
입출고 내역 화면 우측 슬라이딩 패널의 컨테이너입니다. `selection`의 `kind` 값에 따라 `HistoryDetailPanel`(단건) 또는 `HistoryBatchDetailPanel`(묶음) 중 하나를 `DesktopRightPanel` 래퍼 안에 렌더합니다.

## 언제 보나요?
- 입출고 내역 테이블에서 행을 클릭해 selection이 생성될 때 오른쪽에서 슬라이딩으로 등장

## 중요한 내용
- `export interface DesktopHistoryRightPanelProps` — `selection`, `displaySelection`(닫히는 동안 내용 유지), `batchCache`, `canGoBack`, `onBack`, `onLogUpdated`, `onBatchCancelled`, `onClose`
- `displaySelection.kind === "log"` → `HistoryDetailPanel`
- `displaySelection.kind === "batch"` → `HistoryBatchDetailPanel`; 재작업 배치는 `disassembleLog.item_name + " 재작업"` 제목
- `SlidePanel` + `DesktopRightPanel` 두 레이어 구조로 애니메이션과 헤더를 분리
- `backButtonNode` — `canGoBack` true면 "← 뒤로" 버튼 노출 (드릴다운 스택용)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — 단건 상세 패널
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx]] — 묶음 상세 패널
- [[ERP/frontend/app/mes/_components/_history_sections/historyConstants.ts]] — `HistorySelection` 타입
