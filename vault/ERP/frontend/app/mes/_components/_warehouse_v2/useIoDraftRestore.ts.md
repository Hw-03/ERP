# useIoDraftRestore.ts

## 이 파일은 뭐예요?
`restoreDraft` (IoBatch)를 받아 위저드 상태(workType/subType/부서/bundles 등)에 복원하는 effect 훅입니다. "이어서 하기" 클릭마다 증가하는 `restoreNonce`로 같은 draft를 다시 선택해도 복원 effect가 재발동합니다.

## 언제 보나요?
- 임시저장 목록에서 "이어서 하기"를 눌러 draft를 불러올 때
- Strict Mode 이중 실행에서 복원이 두 번 적용되는 버그를 점검할 때

## 중요한 내용
- `useIoDraftRestore(params)` — void 반환. effect만 수행
- `restoreNonce` + `restoredNonceRef` — 같은 nonce 재실행 방지 (Strict Mode 대응)
- `restoredDraftRef` / `autosaveBatchIdRef` — IoComposeView가 소유하고 주입하는 공유 ref
- 복원 후 `state.goTo(4)` — Step 4로 자동 이동

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 공유 ref를 소유하고 이 훅에 주입하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoWorkState.ts]] — 복원에 사용되는 state API 소스
