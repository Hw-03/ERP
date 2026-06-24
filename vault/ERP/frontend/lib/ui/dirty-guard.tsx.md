# dirty-guard.tsx

## 이 파일은 뭐예요?
"저장 안 된 변경" 가드를 담당하는 통합 모듈입니다. Provider 하나가 단일 모달과 `beforeunload` 리스너를 공유하고, 여러 섹션이 각자 dirty 상태를 레지스트리에 등록해 상위 네비게이션 이동 시 경고창을 띄웁니다.

## 언제 보나요?
- 편집 화면에서 저장 없이 탭/사이드바를 이동할 때 경고 모달이 뜨지 않거나 이중으로 뜰 때
- dirty 가드를 새 섹션에 추가하거나 discard 콜백을 연결할 때
- `beforeunload` 브라우저 경고가 예상치 않게 뜨거나 안 뜰 때

## 중요한 내용
- `DirtyGuardProvider` — 앱 최상위(또는 편집 레이아웃)에 단 한 번 마운트. 모달·`beforeunload` 리스너 관리
- `useRegisterDirty(key, dirty, save, discard?)` — 섹션이 자신의 dirty 여부와 저장 함수를 등록. `key`는 유일해야 함
- `useConfirmNavigation()` — 탭/사이드바 상위 컴포넌트에서 호출. 등록된 섹션 중 하나라도 dirty면 모달 표시, 모두 클린이면 즉시 proceed
- `useLocalDirtyGuard(dirty, save)` — 섹션 내부에서 항목 전환(예: 직원 A→B) 시 Provider 단일 모달 재사용
- `DirtyModal` — 내부 전용. "저장하고 이동" / "저장하지 않고 이동" / 취소 세 가지 액션. discard entry의 `discard()` 는 fire-and-forget

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/useFocusTrap.ts]] — 모달 포커스 트랩 훅
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰
- [[ERP/frontend/lib/ui/index.ts]] — `dirty-guard`는 index.ts에서 재export되지 않음 (직접 `@/lib/ui/dirty-guard`로 import)
- [[ERP/frontend/lib/ui/__tests__/dirty-guard.test.tsx]] — 단위 테스트
