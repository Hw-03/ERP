# IoDraftWorkCard.tsx

## 이 파일은 뭐예요?
입출고(IO) 작업 임시저장 묶음(IoBatch) 하나를 카드 형태로 표시하는 컴포넌트. 작업 유형 칩, 자재 목록 펼치기/접기, 부족 경고, 이어서 작업/삭제 버튼을 제공한다.

## 언제 보나요?
- 창고 화면 "작업 중" 탭에서 임시저장된 IO 작업이 있을 때
- `DraftCartPanel`이 `ioDrafts` 목록을 렌더링할 때

## 중요한 내용
- `IoDraftWorkCard({ draft, isBusy, onContinue, onRequestDelete })` — 주요 export
- `DraftLineRow` — 내부 헬퍼, 자재 한 줄을 렌더 (부족 시 빨간 배경, 제외 시 취소선)
- `parseServerTime(iso)` — 백엔드가 timezone-naive UTC를 저장해 `Z` 없는 ISO 문자열을 UTC로 보정 (P1-5 이후 제거 예정)
- `formatRelative(iso)` — "방금 전 / N분 전 / N시간 전 / N일 전" 상대 시각 변환
- `placeArrow(fromDept, fromBucket, toDept, toBucket)` — "창고 → 공정" 형식 방향 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx]] — 이 카드를 ioDrafts 목록으로 사용하는 부모 패널
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `IO_WORK_TYPES`, `deptIoDisplayLabel`, `lineTagLabel`, `subTypeLabel` 등 작업 유형 메타 제공
