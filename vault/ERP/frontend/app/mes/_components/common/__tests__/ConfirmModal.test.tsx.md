# ConfirmModal.test.tsx

## 이 파일은 뭐예요?
`ConfirmModal` 컴포넌트의 동작을 vitest + Testing Library로 검증하는 테스트 파일. `open`/`busy` prop 상태와 키보드 이벤트(Escape·Enter) 처리가 올바른지 7개 케이스로 확인한다.

## 언제 보나요?
- `ConfirmModal`의 키보드 인터랙션(Escape 닫기, Enter 확인, busy 중 차단) 로직을 수정할 때
- 모달이 `open=false`일 때 DOM에 아무것도 렌더되지 않는지 확인할 때

## 중요한 내용
- **테스트 케이스 7개**:
  - `open=true` 시 title·children 렌더 확인
  - Escape 키 → `onClose` 호출
  - `busy=true` 시 backdrop 클릭·Escape 무시
  - `open=false` 시 dialog 미렌더
  - Enter 키 → `onConfirm` 호출
  - `busy=true` 시 Enter 무시
  - Enter 타깃이 TEXTAREA 면 `onConfirm` 호출 안 함(줄바꿈 유지)
- 대상 컴포넌트: `@/lib/ui/ConfirmModal`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/ui/ConfirmModal.tsx]] — 실제 테스트 대상 컴포넌트
