# useAdminModelsCommands.ts

## 이 파일은 뭐예요?
모델 도메인의 목록 수준 명령(추가 / 삭제 / 순서 변경)과 추가 폼 입력 상태(`modelAddName`, `modelAddSymbol`)를 담은 Commands sub-hook입니다.

## 언제 보나요?
- 모델 추가 / 삭제 / 순서 변경 버튼이 동작하지 않을 때
- 삭제 전 confirm 다이얼로그 메시지를 확인할 때

## 중요한 내용
- `add()`: `modelAddName` 필수, `symbol` 선택. 성공 후 입력 초기화
- `delete(slot)`: `confirm()` 팝업 후 React Query mutation 호출. "품목 사용 중이면 삭제 불가" 메시지 포함
- `reorder(ordered)`: 낙관적 `display_order` 재매핑 후 서버 동기화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — `useCreateModelMutation`, `useDeleteModelMutation`, `useReorderModelsMutation`
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModels.ts]] — 이 훅을 포함하는 wrapper
