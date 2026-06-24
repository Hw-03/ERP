# warehouseFlow.golden.test.ts

## 이 파일은 뭐예요?
warehouse_v2 입출고 흐름 전체 규칙을 고정하는 F2-1 패리티 골든 테스트. `ioWorkType.ts`의 모든 public 함수, `useIoWorkState` hook의 canAdvance 행렬·상태전이, `bomSync.ts`의 BOM 비례 재계산 로직의 현재 출력값을 하드코딩 expect로 고정해 이후 증분(F2-2 ~ F2-4)에서 동작 보존을 증명한다.

## 언제 보나요?
- `ioWorkType.ts`, `useIoWorkState.ts`, `bomSync.ts` 중 하나라도 수정할 때
- 입출고 로직 리팩터링(함수 추출, 상태 재설계) 전후 패리티 확인이 필요할 때
- BOM 비례 재계산(produce/disassemble forced, warehouse 미강제) 규칙을 이해할 때

## 중요한 내용
- `IO_WORK_TYPES`, `IO_SUB_TYPES`, `DEFAULT_SUB_TYPE`, `DEPARTMENT_OPTIONS` 상수값 전체 고정
- `canSeeWorkType`: receive는 primary/deputy만, 나머지 workType은 항상 true
- `approvalKind`: warehouse_to_dept/dept_to_warehouse → "warehouse", manual line + 비결재 → "department"
- `isBomForced`: produce/disassemble만 true (자식 수량 강제 재계산)
- `useIoWorkState.canAdvance` 행렬: process 방향 미선택 시 [2]=false, bundles 없으면 [3][4]=false
- BOM 자식 재계산: forced 모드에서는 edited=true여도 강제, 미강제는 edited 보존
- qty=0 입력 시 included 자동 false 전환 (dead-end UX 방지)
- `applyToggleLine`, `applyLineQuantityChange`, `applyBundleQuantityChange` 동작 골든

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — 모든 pure 함수 원본
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoWorkState.ts]] — IoStep 상태 hook
- [[ERP/frontend/app/mes/_components/_warehouse_v2/bomSync.ts]] — BOM 비례 재계산 추출 함수
