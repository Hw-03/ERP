# AdminModelsSection.tsx

## 이 파일은 뭐예요?
관리자 화면의 "모델 관리" 섹션 본체 컴포넌트입니다. 제품 모델 목록(HTML5 DnD 드래그 reorder)과 선택 모델 상세(이름·기호 편집, 연결 품목·BOM 수 요약, 삭제)를 2열로 구성합니다.

## 언제 보나요?
- `AdminSectionContent`에서 `section === "models"`일 때 렌더됨

## 중요한 내용
- `AdminModelsSection({ items, allBomRows })` — export 컴포넌트
- `useAdminModelsContext()` — 모델 목록·추가·편집·삭제·reorder Context 상태 소비
- HTML5 DnD (`draggable`, `onDragStart/Over/Drop/End`) 기반 순서 변경 — 품목 섹션과 달리 HTML5 DnD 사용
- `ModelAddForm` — 새 모델 추가 폼 (모델명 필수, 기호 선택 최대 5자)
- `ModelDetailView` — 선택 모델 편집 + 연결 품목 미리보기(최대 6건) + 삭제 버튼
- `ModelEditForm` 타입 — `useAdminModels`에서 import
- `linkedItems` — `item.model_slots.includes(selected.slot)` 기준
- `linkedBomCount` — `linkedItems`가 부모인 BOM의 수

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminModelsContext.tsx]] — 상태 Context
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminModels.ts]] — `ModelEditForm` 타입 출처
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — 마운트 부모
