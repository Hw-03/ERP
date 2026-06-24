# useIoDraft.ts

## 이 파일은 뭐예요?
입출고 임시저장(draft) API 호출을 감싸는 훅입니다. `saveDraft` (생성/갱신)와 `restoreDraft` (조회) 두 함수를 제공하고, 호출 중에는 `drafting: true`를 반환합니다.

## 언제 보나요?
- 위저드의 저장 버튼을 눌렀을 때 (IoConfirmStep / IoBundleCart)
- "이어서 하기" 기능으로 기존 draft를 불러올 때

## 중요한 내용
- `useIoDraft()` — `{ drafting, saveDraft, restoreDraft }` 반환
- `saveDraft(payload)` — `api.saveDraft` 래퍼. `batchId` 있으면 기존 draft 덮어쓰기
- `restoreDraft(employeeId, workType, subType)` — `api.getDraft` 래퍼

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 훅을 저장/복원 경로에서 사용하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoDraftRestore.ts]] — draft 복원 후 상태 적용 effect 훅
