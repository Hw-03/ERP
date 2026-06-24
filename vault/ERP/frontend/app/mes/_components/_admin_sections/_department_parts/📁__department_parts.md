# 📁 _department_parts

## 이 폴더는 뭐예요?
관리자 화면의 부서 관리 탭(`AdminDepts`)에서만 쓰는 하위 컴포넌트·유틸리티 모음입니다. 부서 추가 폼, 상세 편집 패널, 공통 UI 조각, 색상 팔레트 상수를 각각 별도 파일로 분리해 `AdminDepts.tsx`의 크기를 줄인 결과물입니다.

## 언제 여기를 보나요?
- 부서 추가·수정·삭제·활성화 동작을 수정할 때
- 부서 배지 색상이나 색상 선택기 팔레트를 바꾸고 싶을 때
- 부서 상세 카드의 레이아웃(MetaCell, DetailCardSlot)을 손볼 때

## 주요 파일
- `DeptAddForm.tsx` — 새 부서 이름 입력 + 제출 폼 (제어 컴포넌트)
- `DeptDetailView.tsx` — 선택 부서의 이름·색상 편집, 소속 직원 미리보기, 활성화/삭제 액션
- `departmentDetailPrimitives.tsx` — `MetaCell`(라벨+값 카드), `DetailCardSlot`(섹션 컨테이너) UI 조각
- `departmentColors.ts` — `deptColor` 유틸 + `TAILWIND_PALETTE` 36색 스와치 상수

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx]] — 이 폴더 전체를 소비하는 부모 컴포넌트
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — 부서 목록 전역 상태 및 새로고침 훅
