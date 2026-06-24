# historyQuery.ts

## 이 파일은 뭐예요?
입출고 내역 필터·기간 조립에 필요한 상수와 유틸리티 함수를 정의합니다. 거래 종류 선택지(`OPERATION_OPTIONS`), 기간 선택지(`DATE_OPTIONS`), 날짜 필터 → 서버 파라미터 변환 함수가 들어있습니다.

## 언제 보나요?
- `HistoryFilterBar` — `DATE_OPTIONS` 세그먼트 렌더
- `HistoryFilterPanel` — `OPERATION_OPTIONS` 칩 렌더
- 입출고 내역 View — `dateFilterToFrom`으로 API `date_from` 파라미터 생성

## 중요한 내용
- `OPERATION_OPTIONS: OperationOption[]` — 13종 거래 타입 선택지 (value = TransactionType 코드, label = 화면 표시명)
- `DATE_OPTIONS` — 전체/오늘/이번주/이번달 4가지
- `getPeriodStart(value: string): Date | null` — 기간 값 → Date 변환
- `dateFilterToFrom(dateFilter: string): string | undefined` — `TODAY/WEEK/MONTH/ALL` → `YYYY-MM-DD` API 파라미터
- 3차: scope·타입칩 bucket 로직 폐기, 거래 종류는 백엔드 `_operation_filter`가 sub_type 우선으로 해석

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterBar.tsx]] — `DATE_OPTIONS` 소비
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx]] — `OPERATION_OPTIONS` 소비
