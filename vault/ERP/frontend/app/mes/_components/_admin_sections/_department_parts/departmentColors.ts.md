# departmentColors.ts

## 이 파일은 뭐예요?
부서 색상과 관련된 유틸리티 2가지를 담은 파일입니다. `deptColor`는 부서 객체에서 실제 적용할 hex 색상을 결정하고, `TAILWIND_PALETTE`는 색상 선택기에 표시할 36색 스와치 목록을 정의합니다.

## 언제 보나요?
- 부서 배지·칩의 색상 결정 로직을 추적할 때
- 색상 팔레트 스와치를 추가하거나 변경하고 싶을 때

## 중요한 내용
- `deptColor(d: DepartmentMaster): string` — `d.color_hex`가 있으면 그대로, 없으면 `getDepartmentFallbackColor(d.name)` 반환
- `TAILWIND_PALETTE` — 9 hue(slate/red/orange/amber/green/cyan/blue/violet/pink) × 4 shade(300/500/700/900) = 36개 `{ name, hex }` 객체 배열. `DeptDetailView`의 스와치 그리드에 직접 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/department.ts]] — `getDepartmentFallbackColor` 구현 (이름 기반 폴백 색상 계산)
- [[ERP/frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx]] — TAILWIND_PALETTE 스와치 그리드 소비자
