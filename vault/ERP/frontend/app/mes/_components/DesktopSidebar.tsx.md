# DesktopSidebar.tsx

## 이 파일은 뭐예요?
데스크톱 왼쪽 사이드바 탭 내비게이션 컴포넌트입니다. 마우스 호버 시 72px → 220px로 슬라이드 확장되고, 탭별 고유 색상 아이콘과 레이블·부제목을 표시합니다.

## 언제 보나요?
- `DesktopMesShell` 렌더 시 항상 좌측에 표시됨

## 중요한 내용
- **`DesktopTabId` 타입** 이 파일에서 export — 전체 탭 ID의 단일 출처
- **탭 구성**: MAIN_TABS 6개(대시보드·입출고·불량·내역·창고지도·주간보고) + BOTTOM_TABS 1개(관리) + 테마토글
- `expanded` 상태로 너비 전환 (180ms cubic-bezier 트랜지션)
- 활성 탭: 파란 배경 박스 + 흰 아이콘 / 비활성: 탭별 고유색 아이콘
- 확장 시 hover 탭: cyan glow + 배경 색상 효과
- 로고: 축소 상태(54px 너비) / 확장 상태(168px 너비) 두 버전 페이드 전환
- `alertCount` prop — 대시보드 탭 아이콘에 재고 경고 숫자 뱃지 표시 (현재 DesktopMesShell에서 `zero+low` 합산 전달)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopMesShell.tsx]] — `onTabChange`, `alertCount` 전달 부모
- [[ERP/frontend/app/mes/_components/ThemeToggle.tsx]] — 사이드바 하단 테마 토글
