# DesktopAdminView.tsx

## 이 파일은 뭐예요?
데스크톱 관리자 화면의 최상위 레이아웃 컴포넌트입니다. PIN 잠금 → 해제 흐름을 처리하고, 해제 후엔 왼쪽 사이드바 + 오른쪽 워크스페이스 2단 레이아웃을 렌더링합니다.

## 언제 보나요?
- `/mes?tab=admin` 경로에 진입했을 때
- 관리자 PIN 인증이 필요한 화면 흐름을 수정할 때
- 어드민 섹션(품목/직원/모델/부서/BOM/설정) 간 라우팅 로직을 볼 때

## 중요한 내용
- `DesktopAdminView({ globalSearch, onStatusChange })` — 상위에서 검색어와 상태 콜백을 받음
- `useAdminViewState("models")` — PIN 잠금 상태, 현재 섹션, 부서 선택 등 UI 상태 관리
- `useAdminBootstrap` — 품목·직원·모델·부서·BOM 데이터 일괄 로드
- `useAdminSettings` — PIN 변경 폼 상태
- `guardedSelectSection` — dirty guard(`useConfirmNavigation`)를 통해 섹션 전환 전 확인
- 잠금 상태면 `DesktopPinLock`, 해제 상태면 `AdminSidebar` + `AdminSectionContent`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopPinLock.tsx]] — PIN 잠금 게이트
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminViewState.ts]] — 섹션/잠금 상태
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts]] — 데이터 초기화
