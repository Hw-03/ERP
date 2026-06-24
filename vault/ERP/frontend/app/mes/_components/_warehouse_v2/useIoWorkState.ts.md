# useIoWorkState.ts

## 이 파일은 뭐예요?
입출고 위저드의 모든 상태(workType, subType, bundles, step, 부서, 메모 등)를 관리하는 중앙 상태 훅입니다. 단계 이동·라인 조작·상태 초기화 API를 반환하며, IoComposeView가 이 훅 하나로 위저드 전체 상태를 제어합니다.

## 언제 보나요?
- 위저드 상태 흐름(workType 변경 시 subType/bundles 초기화 등)을 추적할 때
- Step 진행 조건(`canAdvance`)을 수정할 때
- draft 복원 경로(`setDeptIoDirectionRaw` 등 raw setter)를 확인할 때

## 중요한 내용
- `useIoWorkState(initialWorkType?, initialDepartment?)` — 모든 상태 + 조작 API 반환
- `IoStep = 1 | 2 | 3 | 4 | 5` / `IO_STEP_LABELS` — 단계 번호와 레이블 상수
- `canAdvance: Record<IoStep, boolean>` — 각 단계 진행 가능 여부 계산 (useMemo)
- `setWorkType(next)` — workType 변경 시 subType/direction/bundles/step 일괄 초기화
- `updateLine` / `removeLine` — 개별 라인 업데이트·삭제 (bundles 불변 갱신)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 훅을 소비하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoDraftRestore.ts]] — draft 복원 시 이 훅의 raw setter를 사용하는 effect 훅
