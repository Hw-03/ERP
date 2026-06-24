# MobileShell.tsx

## 이 파일은 뭐예요?
모바일 앱 전체를 감싸는 최상위 레이아웃 컴포넌트. 상단 헤더(상태 칩·알림벨·이름 버튼)와 슬라이딩 pill이 있는 하단 5탭 네비게이션 바를 제공하고, 탭별 화면 컴포넌트를 전환·렌더한다.

## 언제 보나요?
- 모바일 기기(또는 좁은 화면)에서 MES 앱에 접속했을 때 항상 표시되는 루트 셸
- `data-testid="mobile-shell"` 이 붙어 있어 E2E 테스트에서 모바일 환경 진입 확인 시

## 중요한 내용
- `MobileShell()` — 유일한 export
- `MobileTabId` — `dashboard | warehouse | defect | history | more | weekly | warehouseMap` 7종
- `TAB_BAR_IDS` — 실제 하단 탭바에 노출되는 5개 (`more` 포함, `weekly`·`warehouseMap` 제외)
- `NavButton` — 하단 탭 버튼 내부 컴포넌트(디자인 동결)
- 슬라이딩 pill: `containerRef` + `pill` state + `useLayoutEffect` 로 활성 버튼 위치 추적
- `handleStatusChange` — 모든 상태 메시지를 헤더 칩 하나로 표시(오류는 sticky, 나머지 3초 후 복귀)
- `warehouseDirty` + `MobileDirtyLeaveSheet` — 입출고 작성 중 탭 이탈 방지 확인 시트
- `?tab=` / `?defect_dept=` URL 파라미터로 초기 탭 딥링크 지원
- `operator` 권한(`canEnterIO`)에 따라 `warehouse`·`defect` 탭 조건부 노출
- `CapacityDetailModal` — 대시보드 생산가능수량 클릭 시 표시되는 모달

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/screens/index.ts]] — 탭별 화면 컴포넌트 모음
- [[ERP/frontend/app/mes/_components/mobile/MobileUserMenuSheet.tsx]] — 사용자 메뉴 시트
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileDirtyLeaveSheet.tsx]] — 이탈 확인 시트
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — TYPO·ELEVATION 디자인 토큰
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — 로그인 사용자 상태
- [[ERP/frontend/app/globals.css]] — `button.no-btn-inset` 옵트아웃 규칙(동결)
