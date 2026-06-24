# HistoryDetailRecentLogs.tsx

## 이 파일은 뭐예요?
거래 상세 패널의 "이 품목의 최근 거래" 리스트를 렌더합니다. 클릭 가능한 거래 카드들을 나열하며, 클릭 시 해당 거래를 상세 패널에 표시하도록 부모에 알립니다.

## 언제 보나요?
- 입출고 내역 우측 상세 패널에서 같은 품목의 이전 거래 흐름을 확인할 때 (현재 화면에서 직접 사용 여부는 부모 HistoryDetailPanel 기준으로 확인 필요)

## 중요한 내용
- `export function HistoryDetailRecentLogs({ itemRecentLogs, onSelectLog })` — `onSelectLog` 콜백으로 상위에 선택을 전달
- 거래 타입별 색상은 `transactionColor`, 라벨은 `getHistoryDisplayLabel` 사용
- `quantity_before/quantity_after` 둘 다 null이면 수량 전후 행 미노출
- Round-13 #3 추출, Phase4 #F4에서 외부 카드 wrapper 제거

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — 이 컴포넌트를 활용하는 부모(Collapsible 내부)
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getHistoryDisplayLabel`
- [[ERP/frontend/app/mes/_components/_history_sections/historyFormat.ts]] — `formatHistoryDate`
