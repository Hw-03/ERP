# 📁 _admin_primitives

## 이 폴더는 뭐예요?
어드민 섹션 전체가 공통으로 쓰는 레이아웃 프리미티브 모음입니다. 페이지 헤더, KPI 바, 목록 패널, 상세 카드 네 가지 빌딩블록을 제공해 부서 관리·직원 관리·PIN 관리 등 각 어드민 화면이 동일한 레이아웃 구조를 유지하게 합니다.

## 언제 여기를 보나요?
- 어드민 섹션의 공통 레이아웃 구성 방식이 궁금할 때
- 새 어드민 페이지를 추가하면서 헤더·목록·상세 패널이 어디서 오는지 추적할 때
- KPI 카드나 탭 동작을 수정해야 할 때

## 주요 파일
- `index.ts` — 전체 배럴 re-export (임포트 진입점)
- `AdminPageHeader.tsx` — 아이콘·제목·위험 영역 배지 헤더
- `AdminKpiBar.tsx` — 가로 KPI 카드 그리드 바
- `AdminListPanel.tsx` — 검색·필터·드래그 스크롤 지원 목록 패널
- `AdminDetailCard.tsx` — 탭 전환·액션·푸터 지원 상세 카드

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 프리미티브를 실제로 조합하는 어드민 섹션 화면들
- [[ERP/frontend/app/mes/_components/common/KpiCard.tsx]] — AdminKpiBar가 내부적으로 사용하는 KPI 카드
- [[ERP/frontend/app/mes/_components/common/EmptyState.tsx]] — AdminListPanel의 빈 목록 UI
- [[ERP/frontend/lib/mes/color.ts]] — 폴더 전체가 의존하는 LEGACY_COLORS 토큰
