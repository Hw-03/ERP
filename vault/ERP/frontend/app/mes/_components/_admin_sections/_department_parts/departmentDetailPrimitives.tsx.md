# departmentDetailPrimitives.tsx

## 이 파일은 뭐예요?
부서 상세 패널(`DeptDetailView`)에서만 쓰는 작은 UI 조각 2개를 모아둔 파일입니다. `MetaCell`은 라벨+값 한 칸짜리 카드이고, `DetailCardSlot`은 제목과 아이콘이 있는 섹션 컨테이너입니다.

## 언제 보나요?
- `DeptDetailView`를 읽다가 레이아웃 컴포넌트 구현이 궁금할 때
- 부서 상세 패널에 새 섹션을 추가하거나 기존 카드 스타일을 수정할 때

## 중요한 내용
- `MetaCell({ label, value, tone?, mono? })` — 배경 `LEGACY_COLORS.s2` 카드에 라벨(10px 대문자 추적)과 값을 표시. `tone`으로 값 색상 지정, `mono`로 고정폭 폰트 전환
- `DetailCardSlot({ title, icon?, children })` — 섹션 타이틀(11px 대문자 bold) + 자유 children 영역. 색상·선반경 모두 LEGACY_COLORS 토큰 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx]] — 이 두 컴포넌트를 실제로 사용하는 유일한 소비자
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 토큰 정의
