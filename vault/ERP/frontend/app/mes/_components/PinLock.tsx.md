# PinLock.tsx

## 이 파일은 뭐예요?
모바일 전용 관리자 PIN 잠금 화면입니다. `DesktopPinLock`과 기능은 같지만 `useVerifyAdminPinMutation`(React Query) 기반이고 레이아웃이 모바일에 맞게 세로 중앙 정렬입니다.

## 언제 보나요?
- 모바일에서 관리자 기능 진입 시
- 모바일 PIN 인증 UX를 수정할 때

## 중요한 내용
- `PinLock({ onUnlocked })` — `onCancel` 없음(모바일은 뒤로가기 네이티브 제스처 사용)
- `useVerifyAdminPinMutation()` — React Query mutation, `isPending`으로 로딩 상태
- `KEYS` — 문자열 배열 `["1"…"9","","0","삭제"]` 방식 (DesktopPinLock의 `KeyDef` 객체 방식과 다름)
- 활성화 색상 `LEGACY_COLORS.purple` (데스크톱은 blue)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopPinLock.tsx]] — 데스크톱 대응 컴포넌트
- [[ERP/frontend/lib/queries/useAdminQuery.ts]] — `useVerifyAdminPinMutation`
