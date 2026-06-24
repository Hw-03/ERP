# DeptAddForm.tsx

## 이 파일은 뭐예요?
관리자 화면에서 새 부서를 추가할 때 쓰는 입력 폼 컴포넌트입니다. 부서명 텍스트 입력 + "부서 추가" 제출 버튼 하나로 구성되며, 이름이 비어 있으면 버튼이 비활성화됩니다.

## 언제 보나요?
- 관리자가 부서 목록 화면에서 "새 부서 추가" 영역을 열 때
- 부서명을 입력하고 제출을 누를 때 부모 컴포넌트의 onSubmit 콜백이 실행됩니다

## 중요한 내용
- `DeptAddForm({ value, onChange, onSubmit })` — 제어 컴포넌트 패턴. 상태는 부모가 소유
- `canSubmit` — `value.trim()` 이 비어있으면 false, 버튼 비활성화
- `LEGACY_COLORS` — 입력창·라벨·버튼 색상에 사용하는 디자인 토큰

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx]] — 이 폼을 실제로 렌더하고 value/onChange/onSubmit을 내려주는 부모 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 토큰 정의
