# 📁 primitives

## 이 폴더는 뭐예요?
모바일 화면 전체에서 공통으로 쓰는 기본 UI 블록(버튼, 카드, 헤더, 배지 등)을 모아놓은 폴더입니다. 각 컴포넌트는 하나의 역할만 하도록 작게 설계되어 있고, 모바일 화면들은 이것들을 조합해서 만듭니다.

## 언제 여기를 보나요?
- 모바일 화면을 새로 만들거나 수정할 때 어떤 공용 컴포넌트가 있는지 찾을 때
- 버튼·헤더·배지 등 특정 UI 요소의 동작·스타일 규칙을 확인할 때
- 모바일 디자인 시스템의 색상·타이포·터치 영역 기준을 파악하고 싶을 때

## 주요 파일
- `index.ts` — 이 폴더 전체의 공개 re-export 배럴 (이것만 import하면 됨)
- `IconButton.tsx` — ghost/solid/outline 아이콘 버튼, 뱃지 지원, WCAG 44px 터치 영역
- `StatusBadge.tsx` — 재고 상태·부서 배지 등 색상 pill 배지
- `ItemRow.tsx` — 품목 한 건을 재고량·배지와 함께 카드형 행으로 표시
- `SegmentedControl.tsx` — 화면 내 탭 전환 세그먼트 컨트롤
- `Stepper.tsx` — ±1/±bigStep 수량 조절 입력기
- `InlineSearch.tsx` — 한글 IME 안정화 처리 내장 검색 입력
- `PinInput.tsx` — 숫자 전용 PIN 비밀번호 입력
- `AsyncState.tsx` — 로딩·에러·빈값·데이터 비동기 상태 분기 래퍼
- `StickyFooter.tsx` — 화면 하단 고정 푸터 컨테이너, iOS safe area 대응
- `PrimaryActionButton.tsx` — 풀 너비 주 액션 버튼 (primary/success/danger/neutral)
- `SheetHeader.tsx` — 바텀시트 상단 헤더 (닫기 버튼 포함)
- `SubScreenHeader.tsx` — 하위 화면 sticky 헤더 (뒤로가기 포함)
- `SectionCard.tsx` — 정보 그룹을 카드로 묶는 컨테이너 + SectionCardRow
- `SectionHeader.tsx` — 섹션 제목 + 우측 액션 경량 헤더
- `WizardHeader.tsx` — 위저드 진행 바 + 단계명 + 선택 요약 칩
- `WizardProgress.tsx` — 위저드 진행 바 + Step N/M (단계명 없는 경량 버전)
- `SummaryChipBar.tsx` — 선택 조건 요약 pill 칩 가로 스크롤 목록
- `PersonAvatar.tsx` — 사원 이름 첫글자 원형 아바타, 부서 색상 자동 적용
- `MoreMenuRow.tsx` — 더보기 탭의 메뉴 행 (아이콘+라벨+설명+뱃지+화살표)
- `QuickActionGrid.tsx` — 빠른 액션 2/3열 그리드
- `FilterChip.tsx` — 필터 선택 칩 + FilterChipRow 가로 스크롤 컨테이너
- `KpiCard.tsx` — KPI 지표 카드 (라벨+수치+컬러 바)
- `ErrorAlert.tsx` — 인라인 에러/경고 메시지 박스

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — TYPO 타이포 토큰, 이 폴더 전체에서 사용
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 팔레트, 이 폴더 전체에서 사용
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — PersonAvatar·ItemRow가 사용하는 부서 색상 컨텍스트
