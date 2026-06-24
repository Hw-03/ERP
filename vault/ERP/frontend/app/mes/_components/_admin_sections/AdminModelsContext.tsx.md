# AdminModelsContext.tsx

## 이 파일은 뭐예요?
모델 관리 섹션의 상태를 React Context로 감싸는 파일입니다. `useAdminModels` 훅의 반환값을 Provider로 주입하고, 하위 컴포넌트가 `useAdminModelsContext()`로 모델 목록·편집 상태를 꺼내 씁니다.

## 언제 보나요?
- `AdminModelsSection`에서 제품 모델 목록·추가·편집·삭제 상태를 공유할 때
- "모델 관리" 섹션이 마운트될 때 (`AdminSectionContent`에서 section === "models"일 때)

## 중요한 내용
- `AdminModelsProvider` — Context Provider, `UseAdminModelsArgs` 받아 훅 실행
- `useAdminModelsContext()` — 모델 상태 접근 훅 (Provider 밖에서 호출 시 throw)
- `AdminModelsState` 타입은 `useAdminModels` 훅에 정의됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModels.ts]] — 실제 상태 로직
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — Provider 주입부
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminModelsSection.tsx]] — Context 소비자
