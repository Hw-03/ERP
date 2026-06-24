# useModelsQuery.ts

## 이 파일은 뭐예요?
모델(X-Ray 기종) 마스터 데이터를 조회·추가·수정·삭제·순서 변경하는 React Query 훅 모음입니다. 이 파일은 다른 도메인 훅의 레퍼런스 패턴으로 명시 지정되어 있습니다.

## 언제 보나요?
- 모델 목록 화면이나 모델 선택 드롭다운에서 데이터 흐름을 추적할 때
- 새 도메인 훅 파일을 만들 때 구조 참고용

## 중요한 내용
- `useModelsQuery(options?)` — `STALE_TIME.MASTER`(30분) 적용, `enabled` 옵션 지원
- `useCreateModelMutation` / `useUpdateModelMutation` / `useDeleteModelMutation` / `useReorderModelsMutation` — 성공 시 `queryKeys.models.all` 전체 invalidate
- `catalogApi.getModels` / `createModel` / `updateModel` / `deleteModel` / `reorderModels`에 1:1 대응
- 삭제는 `{ slot, pin }` 구조 (PIN 필요)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/catalog]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME 상수
