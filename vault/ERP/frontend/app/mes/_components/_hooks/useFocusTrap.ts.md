# useFocusTrap.ts

## 이 파일은 뭐예요?
`@/lib/mes/useFocusTrap`에 있는 정본 훅을 그대로 재수출하는 얇은 래퍼 파일입니다. 기존 `_hooks/` 경로로 import하던 호출처와의 호환성을 유지하기 위해 존재합니다.

## 언제 보나요?
- `useFocusTrap` 실제 로직을 수정해야 할 때 (→ 이 파일 말고 `@/lib/mes/useFocusTrap`을 열어야 함)
- 모달/드로어가 포커스 트랩 동작을 안 할 때 원인을 추적할 때

## 중요한 내용
- `export { useFocusTrap } from "@/lib/mes/useFocusTrap"` — 실체는 lib에 있음
- 이 파일 자체에는 로직 없음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/useFocusTrap.ts]] — 실제 구현체 (포커스 트랩 로직)
