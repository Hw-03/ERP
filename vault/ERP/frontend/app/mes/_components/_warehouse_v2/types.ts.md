# types.ts

## 이 파일은 뭐예요?
`_warehouse_v2` 폴더에서 사용하는 타입 re-export와 로컬 전용 인터페이스를 모아둔 파일입니다. `@/lib/api`의 공용 타입을 re-export하고, 위저드 진입 인텐트(`IoEntryIntent`), 최상위 컴포넌트 props(`IoComposeViewProps`), 로컬 `OperatorLike`를 정의합니다.

## 언제 보나요?
- `_warehouse_v2` 내 파일에서 타입을 임포트할 경로를 확인할 때
- 대시보드 빠른작업 → 위저드 deep-link 인텐트(`IoEntryIntent`)를 수정할 때
- `IoComposeView`의 props 계약을 바꿀 때

## 중요한 내용
- `OperatorLike` — `employee_id`, `name`, `department`, `warehouse_role?`, `level?` 최소 인터페이스
- `IoEntryIntent` — `workType + direction?` (process 전용) 또는 `workType + subType?` (warehouse_io/receive)로 Step 3 프리셋 진입
- `IoComposeViewProps` — `preselectedItem`, `restoreDraft`, `restoreNonce`, `entryIntent` 등 포함
- `DeptIoDirection = "in" | "out"` — process workType 방향 타입 (로컬 재정의)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `IoBundle`, `IoLine`, `IoSubType`, `IoWorkType`, `Item`, `ProductModel` 원본 타입 소스
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — `IoComposeViewProps`를 실제로 소비하는 컴포넌트
