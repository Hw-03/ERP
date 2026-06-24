# DesktopTopbar.tsx

## 이 파일은 뭐예요?
데스크톱 화면 상단 공통 헤더 바입니다. 화면 제목·아이콘·상태 문자열·로그인 사용자 드롭다운(PIN 변경·로그아웃)·알림벨·새로고침 버튼을 한 줄에 담습니다.

## 언제 보나요?
- 전체 데스크톱 레이아웃에서 상단 헤더를 수정할 때
- 로그인 사용자 이름·역할 뱃지 표시 로직을 볼 때
- PIN 변경 또는 로그아웃 흐름을 추적할 때

## 중요한 내용
- `DesktopTopbar({ title, icon?, onRefresh, actionSlot?, status?, statusNonce?, titleAddon?, onNavigate? })`
- `useCurrentOperator()` — 현재 로그인 사용자; `warehouse_role`·`department_role` 에 따라 뱃지 표시
- `WAREHOUSE_ROLE_LABEL` / `DEPARTMENT_ROLE_LABEL` — 역할→레이블 매핑 (`primary`=정, `deputy`=부)
- 드롭다운 외부 클릭 닫기: `document.addEventListener("mousedown", …)`
- PIN 변경: `api.changeMyPin(employee_id, pinCurrent, pinNew)`, 성공 시 `ResultModal`
- 로그아웃: `clearCurrentOperator()` + `window.location.reload()`
- `NotificationBell` 컴포넌트 삽입 슬롯

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — 현재 사용자 상태
- [[ERP/frontend/app/mes/_components/notifications/NotificationBell.tsx]] — 알림 벨 컴포넌트
- [[ERP/frontend/lib/api.ts]] — `changeMyPin` API
