# HistoryDetailPanel.tsx

## 이 파일은 뭐예요?
입출고 내역 단건 선택 시 우측에 표시되는 상세 패널입니다. 거래 정체 카드(Hero), 메모 카드, 메타 스트립(요청자/승인자/취소 버튼), 수정 이력 Collapsible 섹션을 렌더하며, 거래 취소 PIN 입력 폼도 포함합니다.

## 언제 보나요?
- `HistoryTable`에서 `solo` 행 또는 묶음 헤더를 클릭하면 `DesktopHistoryRightPanel`을 통해 이 패널이 열림

## 중요한 내용
- `export function HistoryDetailPanel({ selected, onSelectLog, onLogUpdated })` — `onLogUpdated`로 취소 완료 후 목록 갱신 트리거
- `HistoryDetailHero` — 거래 타입 배지 + 변동요약 알약 + 흐름(from→to) + 재고 전후 표시
- `HistoryDetailMemo` — `export`됨; `HistoryBatchDetailPanel`에서도 재사용
- `HistoryDetailMetaStrip` — 요청자·승인자 시각, "취소" 버튼
- `Collapsible` — 수정 이력 섹션 접기/펼치기 래퍼
- `CancelState` — `idle | confirm | submitting | error` 4단계 상태 머신
- `FlowState` — `idle | loading | available | unavailable`; `operation_batch_id` 있을 때 IoBatch 로드

## 위험도
🔴 높음 — PIN 인증 후 `api.cancelTransaction`을 호출해 거래를 취소하는 변경 로직 포함. 취소는 재고에 직접 영향을 줌.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx]] — 이 패널을 `kind="log"`일 때 렌더하는 래퍼
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailEditHistory.tsx]] — 수정 이력 본문
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getBatchFlowEndpoints`, `getSingleLogMovement` 등
