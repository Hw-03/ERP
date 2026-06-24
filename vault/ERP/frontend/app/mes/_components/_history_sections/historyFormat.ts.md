# historyFormat.ts

## 이 파일은 뭐예요?
입출고 내역 화면 전반에서 사용하는 날짜/시각 파싱·포맷 순수 함수 모음입니다. UTC ISO 문자열을 받아 단축 형식, 정본 긴 형식, YYYY-MM-DD 키로 변환합니다.

## 언제 보나요?
- `HistoryLogRow`, `HistoryDetailPanel`, `HistoryBatchDetailPanel`, `historyTableHelpers` 등 날짜 표시가 필요한 모든 컴포넌트

## 중요한 내용
- `parseUtc(iso: string): Date` — Z/오프셋 없는 문자열에 Z를 붙여 UTC 기준으로 파싱
- `formatHistoryDate(iso)` — `MM/DD HH:mm` 단축 형식 (목록 행 일시)
- `formatHistoryDateTimeLong(iso)` — `YYYY년 M월 DD일    HH시 MM분` 정본 형식 (우측 패널 메타)
- `toDateKey(iso)` — `YYYY-MM-DD` 문자열 (달력 맵 인덱스·필터 키)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailEditHistory.tsx]] — `parseUtc` 직접 사용
