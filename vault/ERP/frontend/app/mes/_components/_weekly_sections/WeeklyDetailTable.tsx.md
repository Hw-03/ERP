# WeeklyDetailTable.tsx

## 이 파일은 뭐예요?
주간보고에서 특정 공정 그룹을 선택했을 때 해당 그룹의 품목별 상세 입출고 수량을 보여주는 테이블(데스크톱) / 카드 리스트(모바일) 컴포넌트입니다. 데이터가 없으면 `EmptyState`를 렌더링합니다.

## 언제 보나요?
- 주간보고에서 좌측 `WeeklyGroupCards`에서 공정을 클릭했을 때 우측에 표시됨
- `group`이 undefined이거나 items 배열이 비어 있으면 빈 상태 안내문 노출

## 중요한 내용
- `WeeklyDetailTable` — `memo` 감싼 export, `group: WeeklyGroupReport | undefined` 단일 prop
- 공정 요약 헤더: `dept_name`, `process_code`, `current_qty`, `produce_qty`, `receive_qty`, `out_qty`, `delta` 표시
- 데스크톱(`lg:`) — `minWidth: 680` 테이블, 8컬럼(품목코드·품명·전주재고·생산·입고·출고·현재재고·증감)
- 모바일(`lg:hidden`) — 품목당 카드 1장, 5개 수치(전주/생산/입고/출고/현재) grid
- `Num` 내부 컴포넌트 — 숫자 셀 공통 렌더(0→"—", 하이라이트 색 혼합 배경)
- 재고 감소(`delta < 0`) 행에 빨간 tint 배경 강조
- `formatQty` 사용, `mes_code` 없으면 "—"

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopWeeklyReportView.tsx]] — 이 컴포넌트를 렌더링하는 주간보고 데스크톱 뷰
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx]] — 공정 선택 카드 (연동)
- [[ERP/frontend/lib/api/types/weekly.ts]] — `WeeklyGroupReport` 타입
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS`
- [[ERP/frontend/lib/mes/format.ts]] — `formatQty`
- [[ERP/frontend/app/mes/_components/common/EmptyState.tsx]] — 빈 상태 컴포넌트
