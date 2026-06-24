# PersonAvatar.tsx

## 이 파일은 뭐예요?
사원의 이름 첫 글자를 원형 아바타로 표시하는 컴포넌트입니다. 부서별 색상(`useDeptColor`)을 자동으로 적용하며, 선택 상태에서는 채운 원형, 비선택 시에는 반투명 배경으로 표시합니다.

## 언제 보나요?
- 작업자·결재자 선택 시 사원 목록을 아바타 형태로 나열할 때
- 결재 대기열에서 담당자 표시할 때

## 중요한 내용
- `PersonAvatar({ name, department?, selected?, onClick?, size?, showLabel?, className? })`
- `size`: `"sm"(h-9 w-9)` / `"md"(h-11 w-11, 기본)` / `"lg"(h-14 w-14)`
- `department`가 있으면 `useDeptColor`로 해당 부서 색상 자동 적용
- `firstEmployeeLetter(name)`으로 아바타 내 표시 글자 추출
- `showLabel=true`(기본)이면 이름을 아바타 아래에 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useDeptColor` 훅 출처
- [[ERP/frontend/lib/mes/employee.ts]] — `firstEmployeeLetter` 함수 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
