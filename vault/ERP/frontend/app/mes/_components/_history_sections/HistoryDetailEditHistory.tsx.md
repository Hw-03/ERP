# HistoryDetailEditHistory.tsx

## 이 파일은 뭐예요?
거래 단건 상세 패널(`HistoryDetailPanel`)의 "수정 이력" 섹션 본문을 렌더합니다. `TransactionEditLog` 배열을 받아 수정자 이름, 수정 시각, 사유, 수량 보정 여부를 카드 형태로 나열합니다.

## 언제 보나요?
- 입출고 내역 우측 상세 패널에서 수정된 거래(`edit_count > 0`)를 선택했을 때
- Collapsible "수정 이력" 섹션이 열린 상태

## 중요한 내용
- `export function HistoryDetailEditHistory({ edits }: { edits: TransactionEditLog[] })` — props는 `edits` 하나
- `e.correction_log_id`가 있을 때 "수량 보정 거래 생성됨" 노란 문구 노출
- Round-13 #3 추출, Phase4 #F4에서 외부 카드 wrapper 제거(부모 Collapsible이 카드 담당)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — 이 컴포넌트를 Collapsible 안에 렌더하는 부모
- [[ERP/frontend/app/mes/_components/_history_sections/historyFormat.ts]] — `parseUtc` 날짜 파싱 함수
