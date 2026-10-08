# _warehouse_v2/ - 입출고 2.0 작업 Module

이 폴더는 현재 운영 중인 입출고(IO) 작업 화면의 핵심 Module입니다.
`v2`라는 이름은 과거 1차 창고 입출고 화면을 대체한 두 번째 구현이라는 뜻이며, 폐기 예정 코드가 아닙니다.

## 먼저 볼 파일

- `IoComposeView.tsx`: 입출고 작업 전체 흐름을 조립하는 컨테이너입니다.
- `ioWorkType.ts`: 작업 유형과 세부 작업 규칙을 정의합니다.
- `useIoWorkState.ts`: 단계 이동, 작업 상태, 라인 수량 변경을 관리합니다.
- `types.ts`: 입출고 화면에서 공유하는 타입입니다.

## 단계별 UI

원자재 입출고는 작업 유형 → 입고·출고 선택 → 공급업체 선택 → 품목 선택 → 수량 조정 → 최종 확인의 6단계입니다. 방향 단계의 내부 ID는 `6`이며 기존 `2`~`5`의 URL 의미는 유지합니다. 다른 작업은 기존 5단계입니다.

공급업체는 하나의 입력으로 검색하고 새 이름을 추가·선택합니다. 숨김 업체와 동일한 이름은 관리 화면에서 복원합니다. 원자재 출고는 붉은색으로 표시하며, 예약분을 제외한 정상 창고 가용 재고가 없는 품목은 새로 선택할 수 없습니다. 원자재 초안은 출고 사유 없이 저장하고 저장한 단계로 복원하며, 활성 업체를 재확인합니다. 출고 사유는 최종 제출 때만 필수입니다.

튜브 직원에게는 `튜브 원자재 입출고`(`tube_material`)가 추가로 표시됩니다. 같은 단계 화면을 재사용하되 `TR` 품목만 직접 선택하고, 튜브 정상 재고를 입고·출고합니다. BOM을 전개하거나 부서를 선택하지 않으며 승인 없이 즉시 반영합니다. 입고는 `RECEIVE`, 출고는 `MATERIAL_OUT`으로 기록합니다.

업체 선택 화면의 `supplierScope`는 기본 `warehouse`이며 튜브 원자재 입출고에는 `tube`를 전달합니다. 튜브 직원 모두 전용 업체를 관리합니다. 기존 불량 화면에서도 튜브 격리 원건에 연결된 `TR` 품목의 반품에는 튜브 업체 목록을 사용하고, 그 밖의 반품은 기존 창고 목록을 유지합니다.

- `IoWorkTypeStep.tsx`: 작업 유형 선택
- `MaterialDirectionStep.tsx`: 기존 방향 카드를 재사용한 원자재 입고·출고 선택
- `SupplierPickerStep.tsx`: 원자재 입출고 공급업체 검색·선택·관리
- `IoTargetPicker.tsx`: 대상 품목 선택
- `IoBundleCart.tsx`, `IoBundleCard.tsx`, `IoLineRow.tsx`: 선택된 품목 묶음과 수량 입력
- `IoConfirmStep.tsx`: 제출 전 확인
- `IoSubmitModals.tsx`: 제출 결과와 확인 모달

수량 조정 단계는 단품·BOM 하위 행과 BOM 상위 요약에 실제 재고 반영 위치를 표시합니다. 입고는 `입고 위치`, 출고는 `차감 위치`, 창고·부서 간 이동은 `이동 경로`, 창고 수량보정은 `조정 위치`로 표시합니다. `ioInventoryLocation.ts`는 실제 행의 버킷·부서와 커스텀 BOM의 변환된 반영 방향을 기준으로 위치를 판정하며, 반영되는 상위가 없으면 하위 위치를 집계합니다. `IoLocationBadge.tsx`가 공통 표시를 담당하고, `IoDeductionSourceBadge.tsx`는 최종 확인 화면의 기존 사용출고 표시를 유지합니다. 품목 아래에는 코드와 제외·재입고·재고 미반영 같은 예외 안내만 남깁니다.

## 백엔드 호출 흐름

- `useIoPreview.ts`: BOM 전개 미리보기
- `useIoDraft.ts`, `useIoDraftRestore.ts`: 임시저장과 복원
- `useIoSubmit.ts`: 최종 제출
- `useIoUrlSync.ts`: 단계 URL 동기화
- `useIoPreselect.ts`: 대시보드 등에서 진입할 때 사전 선택 처리

## 테스트

- `__tests__/warehouseFlow.golden.test.ts`: 작업 유형, 단계 전환, 주요 분기 로직의 기준선 테스트
- `__tests__/useIoUrlSync.test.tsx`: 단계 URL 동기화 테스트
- `__tests__/useIoPreselect.test.tsx`: 사전 선택 진입 테스트

## 향후 개선 후보

이번 리뷰 준비 작업에서는 아래 구조 변경을 하지 않습니다. 입출고는 실제 재고 수량을 바꾸는 핵심 흐름이므로,
권동환 사원이 코드를 본 뒤 경계를 함께 정하고 진행하는 편이 안전합니다.

- `IoComposeView.tsx`: autosave, layout 보정, 업무 계산 로직 분리 후보
- `IoTargetPicker.tsx`: 필터, 정렬, 테이블 렌더링 분리 후보

수정 전에는 `warehouseFlow.golden.test.ts`와 관련 백엔드 입출고 테스트를 먼저 확인하세요.
