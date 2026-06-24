# useSettingsQuery.test.ts

## 이 파일은 뭐예요?
`useSettingsQuery.ts`의 4개 훅을 MSW `settingsHandlers`로 네트워크 모킹해 검증하는 단위 테스트입니다. 감사 CSV 파일 목록, PIN 0000 검증 성공/9999 실패, PIN 변경 성공/실패, DB 초기화 성공을 커버합니다.

## 언제 보나요?
- settings 훅의 테스트 커버리지를 확인하거나 새 케이스를 추가할 때

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useSettingsQuery.ts]] — 테스트 대상
