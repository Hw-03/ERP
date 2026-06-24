# 📁 _employees_parts

## 이 폴더는 뭐예요?
관리자 화면 직원 탭(`AdminEmployeesSection`)의 우측 패널 컴포넌트를 분리해 담아 두는 폴더입니다. Round-10B 리팩터링 때 큰 JSX 블록을 역할별로 추출했습니다.

## 언제 여기를 보나요?
- 직원 추가 폼(우측 패널) 동작이나 디자인을 수정할 때
- 직원 선택 후 편집 패널(정보수정·PIN·비활성화·삭제) 로직을 변경할 때

## 주요 파일
- `EmployeeAddPanel.tsx` — 직원 추가 모드일 때 우측에 표시되는 입력 폼 패널
- `EmployeeEditPanel.tsx` — 직원 선택 시 우측에 표시되는 정보 수정·PIN 관리·삭제 패널

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 폴더를 사용하는 상위 AdminEmployeesSection
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — 직원 관리 상태·폼 훅
