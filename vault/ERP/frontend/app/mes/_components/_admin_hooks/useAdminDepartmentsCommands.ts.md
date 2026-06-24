# useAdminDepartmentsCommands.ts

## 이 파일은 뭐예요?
부서 도메인의 list-level 변경 명령(추가/비활성화/활성화/영구삭제/순서변경/색상변경)을 모두 담은 Commands sub-hook입니다. React Query mutation을 직접 호출하고, `DepartmentsContext` refresh도 발동합니다.

## 언제 보나요?
- 부서 추가·삭제·순서 변경 버튼이 동작하지 않을 때
- 새 부서에 자동 배정되는 색상(`pickAutoColor`) 로직을 확인할 때
- `COLOR_PALETTE` 12색 목록이 필요할 때

## 중요한 내용
- `COLOR_PALETTE`: 12가지 hex 색상 상수 (re-export 경유지 `useAdminDepartments.ts`)
- `pickAutoColor(existingDepts)`: 이미 쓰인 색과 가장 색조 차이가 큰 색을 자동 선택
- `add()`: 입력된 이름 + `pickAutoColor` 색상으로 부서 생성 후 Context 갱신
- `reorder(ordered)`: active 먼저, inactive 뒤 순서로 `display_order` 재매핑
- `updateColor(id, colorHex)`: 색상만 단독 업데이트

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useDepartmentsQuery.ts]] — 부서 React Query mutation 훅 4종
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useRefreshDepartments` 컨텍스트
- [[ERP/frontend/lib/mes/color.ts]] — `employeeColor` (기본 색 계산)
