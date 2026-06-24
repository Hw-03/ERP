# page.tsx

## 이 파일은 뭐예요?
`/mes` 경로의 Next.js App Router 진입점으로, 전역 Provider(AdminSession, QueryProvider, DepartmentsProvider)를 감싸고 로그인 게이트를 통과한 뒤 화면 크기에 따라 모바일 Shell 또는 데스크톱 Shell을 렌더링합니다.

## 언제 보나요?
- MES 앱 전체 진입 흐름(Provider 구성, 로그인 게이트 순서)을 파악할 때
- 모바일/데스크톱 Shell 분기 방식(`lg:hidden` CSS 토글)을 확인할 때

## 중요한 내용
- `MesPage` — default export, 최상위 Provider 트리 구성
- `MesBody` — 실제 Shell 분기 컴포넌트: `div.lg:hidden` 안에 `MobileShell`, 그 밖에 `DesktopMesShell`
- Provider 순서: `AdminSessionProvider` → `QueryProvider` → `DepartmentsProvider` → `MesLoginGate`
- 두 Shell이 CSS로 동시에 DOM에 존재함(JS 분기가 아님) — E2E locator는 `filter({visible:true})` 필요

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/MesLoginGate.tsx]] — 로그인 통과 후 children 렌더
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 모바일 Shell
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — 부서 목록 전역 공급
