# _warehouse_v2/ - 입출고 2.0 작업 Module

이 폴더는 현재 운영 중인 입출고(IO) 작업 화면의 핵심 Module입니다.
`v2`라는 이름은 과거 1차 창고 입출고 화면을 대체한 두 번째 구현이라는 뜻이며, 폐기 예정 코드가 아닙니다.

## 먼저 볼 파일

- `IoComposeView.tsx`: 입출고 작업 전체 흐름을 조립하는 컨테이너입니다.
- `ioWorkType.ts`: 작업 유형과 세부 작업 규칙을 정의합니다.
- `useIoWorkState.ts`: 단계 이동, 작업 상태, 라인 수량 변경을 관리합니다.
- `types.ts`: 입출고 화면에서 공유하는 타입입니다.

## 단계별 UI

- `IoWorkTypeStep.tsx`: 작업 유형 선택
- `IoTargetPicker.tsx`: 대상 품목 선택
- `IoBundleCart.tsx`, `IoBundleCard.tsx`, `IoLineRow.tsx`: 선택된 품목 묶음과 수량 입력
- `IoConfirmStep.tsx`: 제출 전 확인
- `IoSubmitModals.tsx`: 제출 결과와 확인 모달

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
