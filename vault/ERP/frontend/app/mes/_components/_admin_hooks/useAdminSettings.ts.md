# useAdminSettings.ts

## 이 파일은 뭐예요?
관리자 PIN 변경 폼 상태와 `changePin()` 액션, 짧은 토스트 메시지(`saveMessage`)를 담은 훅입니다. `DesktopAdminView`의 설정 섹션 전용으로 추출됐습니다.

## 언제 보나요?
- 관리자 PIN 변경이 실패하거나 확인 PIN 불일치 에러를 추적할 때
- 토스트 메시지(`saveMessage`) 자동 소멸(2500ms) 타이밍을 확인할 때

## 중요한 내용
- `useAdminSettings(opts): UseAdminSettingsResult`
- `pinForm`: `{ current_pin, new_pin, confirm_pin }` — 세 필드 모두 필요
- `changePin()`: new_pin ≠ confirm_pin이면 onError 호출 후 중단
- `showSave(text)`: `saveMessage` 노출 후 2500ms 뒤 자동 null
- `resetDatabase` / `resetPin` 제거됨(PR-2.2-6)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `api.updateAdminPin`
