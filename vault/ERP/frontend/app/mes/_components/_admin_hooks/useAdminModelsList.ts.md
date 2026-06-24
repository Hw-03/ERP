# useAdminModelsList.ts

## 이 파일은 뭐예요?
모델 목록을 `visibleItems`로 노출하는 최소 List sub-hook입니다. 현재 모델 도메인은 검색·필터 UI가 없어 `visibleItems`가 입력 목록 그대로 반환됩니다.

## 언제 보나요?
- 모델 목록에 필터·검색 기능을 추가해야 할 때 (확장 시작점 파악)
- wrapper 훅(`useAdminModels`)이 `list.items`를 어떻게 참조하는지 확인할 때

## 중요한 내용
- `useAdminModelsList({ productModels }): UseAdminModelsListState`
- `items`, `visibleItems` 둘 다 동일한 `productModels` 참조 (필터 없음)
- 추후 활성/비활성 필터 추가 시 이 훅에서 처리 예정 (주석으로 명시됨)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModels.ts]] — 이 훅을 포함하는 wrapper
