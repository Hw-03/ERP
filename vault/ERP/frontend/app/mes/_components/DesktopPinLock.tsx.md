# DesktopPinLock.tsx

## 이 파일은 뭐예요?
데스크톱 관리자 PIN 잠금 화면입니다. 4자리 숫자 키패드 UI를 제공하고, 4번째 자리 입력 즉시 `api.verifyAdminPin`을 호출해 인증 결과를 처리합니다.

## 언제 보나요?
- 관리자 메뉴 진입 시 PIN이 아직 해제되지 않았을 때
- PIN 인증 UX(흔들림 애니메이션, 오류 표시)를 수정할 때

## 중요한 내용
- `DesktopPinLock({ onUnlocked, onCancel? })` — 인증 성공 시 `onUnlocked(pin)`, 취소 버튼 클릭 시 `onCancel()`
- `PIN_LENGTH = 4` — 고정 길이
- `KEYS: KeyDef[]` — `digit | back | empty` 3종 키 정의
- 잘못된 PIN 입력 시 `shakeNonce` 증가 → `animate-admin-pin-shake` CSS 애니메이션 재실행
- 배경 데코에 `LEGACY_COLORS` 브랜드 그라데이션 적용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopAdminView.tsx]] — 이 컴포넌트를 gate로 사용
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
- [[ERP/frontend/lib/api.ts]] — `verifyAdminPin` API
