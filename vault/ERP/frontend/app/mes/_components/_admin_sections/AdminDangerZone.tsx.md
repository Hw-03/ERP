# AdminDangerZone.tsx

## 이 파일은 뭐예요?
관리자 PIN 변경 UI를 담당하는 "보안" 섹션 컴포넌트입니다. 현재 PIN, 새 PIN, 새 PIN 확인 세 필드를 받아 일치 여부를 검증하고, 상위에서 내려준 `onChangePin` 핸들러를 호출합니다.

## 언제 보나요?
- 관리자 화면 사이드바에서 "보안" 메뉴를 선택했을 때
- 관리자 PIN을 변경해야 할 때

## 중요한 내용
- `AdminDangerZone` — export 컴포넌트. props: `pinForm`, `setPinForm`, `onChangePin`
- `PinForm` 타입: `{ current_pin, new_pin, confirm_pin }`
- `canChangePin` — 세 필드 모두 비어 있지 않고 `new_pin === confirm_pin`일 때만 버튼 활성화
- `PinField` — password 입력 + 에러 메시지 로컬 컴포넌트
- 실제 API 호출 로직은 이 파일에 없음 — `onChangePin` prop으로 위임

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — `changePin` 함수를 주입하는 부모
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx]] — 섹션 헤더
