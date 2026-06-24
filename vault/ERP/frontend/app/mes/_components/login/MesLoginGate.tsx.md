# MesLoginGate.tsx

## 이 파일은 뭐예요?
MES 전체 화면을 감싸는 인증 게이트 컴포넌트. 로그인되지 않은 상태면 DEXCOWIN 로고 인트로 + PIN 로그인 카드를 보여주고, 인증된 상태면 `children`(메인 화면)을 그대로 렌더한다. 서버 재시작(boot_id 불일치) 또는 비활성 직원이면 강제 재로그인 처리한다.

## 언제 보나요?
- 앱 최상단 레이아웃에서 MES 화면 전체를 래핑할 때
- localStorage에 작업자 정보가 없거나 boot_id가 불일치할 때 로그인 화면으로 분기될 때
- 서버 재시작 후 첫 화면 진입 시

## 중요한 내용
- `GatePhase`: `"loading" | "intro" | "form" | "authed"` — 4단계 흐름
- `LogoState`: `"center" | "above-card"` — 로고 위치 전환 트랜지션
- `SHRINK_TRANSFORM` / `CENTER_TRANSFORM` / `MOBILE_CENTER_TRANSFORM`: 로고 축소 이동 transform 상수(정밀 수식 주석 포함)
- boot_id 불일치 감지: `api.getAppSession()` 응답 vs `getStoredBootId()` 비교 → 불일치 시 `clearCurrentOperator()` 후 재로그인
- `prefers-reduced-motion` 감지: 애니메이션 생략하고 바로 `form` 진입
- 로그인 후 `handleLogin`에서 현재 탭이 `dashboard`가 아니면 `/mes?tab=dashboard`로 강제 이동

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/OperatorLoginCard.tsx]] — form 단계에 렌더하는 PIN 카드
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — `readCurrentOperator`, `clearCurrentOperator`, `getStoredBootId` 사용
