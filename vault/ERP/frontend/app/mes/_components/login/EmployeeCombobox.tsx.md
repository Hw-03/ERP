# EmployeeCombobox.tsx

## 이 파일은 뭐예요?
직원 이름·부서·사번으로 검색할 수 있는 접근성(ARIA combobox) 지원 드롭다운 컴포넌트. 한글 초성 검색, 영타→한글 자동 변환(toHangul/toQwerty), 키보드 탐색(방향키·Enter·Tab·Escape)을 모두 지원한다.

## 언제 보나요?
- `OperatorLoginCard`에서 직원 선택 필드로 사용될 때
- 사용자가 이름 또는 부서로 직원을 검색해 선택할 때

## 중요한 내용
- `EmployeeComboboxProps`: `employees`, `value`, `onChange`, `autoFocus?`, `disabled?`
- 검색 필터: 이름·부서·사번 + 영타 원본 버퍼(`rawRef`) 폴백 + `toChosung`으로 초성 일치
- 영타 입력 시 `toQwerty`→`toHangul` 파이프로 Caps Lock 무관하게 한글 조립
- `aria-controls`, `aria-expanded`, `aria-activedescendant` 등 ARIA 완비
- 항목 선택(commit) 시 query 초기화 + input blur, 외부 클릭 시 자동 닫힘

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/OperatorLoginCard.tsx]] — 이 컴포넌트를 사용하는 로그인 카드
- [[ERP/frontend/lib/hangul.ts]] — `toChosung`, `toHangul`, `toQwerty` 한글 유틸 함수
