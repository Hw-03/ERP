# dirty-guard.test.tsx

## 이 파일은 뭐예요?
`dirty-guard` 훅·컨텍스트(`DirtyGuardProvider`, `useRegisterDirty`, `useConfirmNavigation`, `useLocalDirtyGuard`)의 동작을 검증하는 테스트 파일입니다. 미저장 상태에서 페이지 이동 시 확인 모달이 뜨는지, 저장/폐기/취소 각 선택이 올바르게 동작하는지를 8개 케이스로 커버합니다.

## 언제 보나요?
- `dirty-guard.tsx` 소스를 수정할 때 어떤 케이스가 보호되는지 확인할 때
- "저장하고 이동" / "저장하지 않고 이동" / ESC 등 모달 분기 로직을 변경하기 전 기존 스펙 파악할 때

## 중요한 내용
- **케이스 1~2**: dirty 섹션이 없거나 `dirty=false` 이면 모달 없이 `proceed` 즉시 호출
- **케이스 3**: `dirty=true` 등록 후 `confirmNavigation` → `role="dialog"` 모달 노출
- **케이스 4**: "저장하고 이동" → `save()` 호출 후 `proceed` 호출
- **케이스 5**: "저장하지 않고 이동" → `save` 미호출, `proceed` 호출
- **케이스 6**: ESC → `save`·`proceed` 둘 다 호출 안 함, 모달 닫힘
- **케이스 7**: 다중 섹션 등록 시 `dirty=true`인 섹션의 `save`만 순차 호출
- **케이스 8**: `useLocalDirtyGuard` 독립 사용도 동일 모달 흐름으로 동작

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/ui/dirty-guard.tsx]] — 실제 훅·Provider 구현체
