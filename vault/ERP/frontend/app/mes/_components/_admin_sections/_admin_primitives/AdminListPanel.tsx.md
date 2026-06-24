# AdminListPanel.tsx

## 이 파일은 뭐예요?
어드민 화면 좌측의 목록 패널 컨테이너입니다. 제목·건수 레이블·검색창·필터 슬롯·아이템 목록·푸터를 하나의 둥근 카드 안에 배치하며, 드래그 중 마우스 휠 스크롤을 수동으로 처리합니다.

## 언제 보나요?
- 부서 관리·직원 관리 화면처럼 왼쪽 목록 + 오른쪽 상세 레이아웃에서 목록 쪽 패널을 구성할 때
- 항목을 드래그 정렬할 수 있는 화면에서 드래그 중에도 목록을 스크롤해야 할 때

## 중요한 내용
- `AdminListPanelProps<T>` — 제네릭 타입으로 어떤 데이터 모양이든 수용
  - `renderItem: (item: T) => ReactNode` — 각 행 렌더링 콜백
  - `width` — 기본값 320(px 또는 string)
  - `onSearchChange` 있을 때만 검색창 렌더
- `useEffect`로 `wheel` 이벤트를 `passive: false`로 등록 — HTML5 drag API가 기본 스크롤을 막는 문제 해결
- 빈 목록이면 `emptyState` prop 또는 `<EmptyState variant="no-data" compact />` 자동 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/EmptyState.tsx]] — 빈 목록 기본 UI
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/index.ts]] — 외부 노출 진입점
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰 정의
