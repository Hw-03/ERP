# SubScreenHeader.tsx

## 이 파일은 뭐예요?
모바일 하위 화면(sub-screen)의 상단에 고정되는 sticky 헤더 컴포넌트입니다. 왼쪽 뒤로가기 버튼, 중앙 제목/부제, 우측 액션 슬롯으로 구성됩니다.

## 언제 보나요?
- 탭 화면에서 세부 화면으로 전환할 때 상단 헤더로 사용 (WeeklyReportScreen, PlaceholderScreen 등)
- 뒤로가기가 필요한 모든 모바일 서브 화면

## 중요한 내용
- `SubScreenHeader({ title, subtitle?, onBack, right? })` — `onBack`은 필수
- `sticky top-0 z-10` 으로 스크롤 시에도 상단 고정
- 뒤로가기 버튼은 `IconButton`의 `ArrowLeft` 아이콘 사용
- `subtitle`은 대문자+자간 2px `overline` 스타일로 제목 위에 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/IconButton.tsx]] — 뒤로가기 버튼 컴포넌트
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
