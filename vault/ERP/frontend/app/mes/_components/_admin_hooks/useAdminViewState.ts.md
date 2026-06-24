# useAdminViewState.ts

## 이 파일은 뭐예요?
관리자 화면의 UI 표현 상태(잠금 여부 / 활성 섹션 / 선택 부서)만 담당하는 훅입니다. 데이터·도메인 상태는 `useAdminBootstrap`이 맡고, 이 훅은 화면 구조 상태만 책임집니다.

## 언제 보나요?
- 관리자 PIN 잠금·해제 흐름(`unlock` / `lock`)을 추적할 때
- 탭(섹션) 전환이 어디서 제어되는지 확인할 때
- `useAdminSession`을 통한 X-Admin-Pin 헤더 자동 주입 흐름을 이해할 때

## 중요한 내용
- `AdminSection` 유니언 타입: `"items" | "employees" | "models" | "bom" | "export" | "audit" | "settings" | "departments"`
- `unlock(pin)`: `setAdminPin` + `setUnlocked(true)` + `useAdminSession.setPin(pin)` — 세션 헤더 등록
- `lock()`: `setUnlocked(false)` + `clearPin()` — 세션 PIN 제거
- `selectSection(next)`: 섹션 전환, `useCallback`으로 안정화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/auth/admin-session.tsx]] — `useAdminSession` (PIN 세션 관리)
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminBootstrap.ts]] — 데이터 부트스트랩 훅 (`unlocked` 수신)
