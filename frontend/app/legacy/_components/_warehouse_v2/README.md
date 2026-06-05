# _warehouse_v2/ — 입출고(IO) 작업 화면

> 이 폴더는 현재 운영 중인 **입출고 작업(IO)** 화면의 핵심 컴포넌트 모음입니다.
> 이름에 `v2` 가 붙은 이유는 1세대 창고 입출고 화면을 대체해 만든 **현재 정본**이기 때문입니다.

## 중심 컴포넌트

- `IoComposeView.tsx` — 입출고 작업 전체 흐름의 컨테이너 (작업 유형 선택 → 품목·수량 입력 → 확인 → 제출).

## 단계 UI

- `IoWorkTypeStep.tsx` — 작업 유형 선택 단계
- `IoTargetPicker.tsx` — 대상(부서/위치 등) 선택
- `IoConfirmStep.tsx` — 제출 전 확인 단계
- `IoBundleCart.tsx` / `IoBundleCard.tsx` / `IoLineRow.tsx` — 담은 품목 묶음·줄 표시
- `IoSubmitModals.tsx` — 제출 관련 모달
- `itemPickerShared.tsx`, `_atoms.tsx` — 공용 UI 조각

## 상태·로직 훅 (평면 파일)

- `useIoWorkState.ts` — 작업 상태 전반
- `useIoPreview.ts` — BOM 전개 미리보기
- `useIoSubmit.ts` — 제출 처리
- `useIoDraft.ts` / `useIoDraftRestore.ts` — 임시저장 / 복원
- `useIoUrlSync.ts` — URL 쿼리 동기화 (뒤로가기 대응)
- `useIoPreselect.ts` — 진입 시 사전 선택

## 보조

- `bomSync.ts`, `BomSubExpander.tsx` — BOM 전개 로직 / 하위 펼치기
- `ioWorkType.ts`, `types.ts` — 작업 유형 정의 / 타입
- `__tests__/` — golden·단위 테스트

## 건드릴 때 조심할 점

- 입출고는 실제 재고 수량을 바꾸는 흐름입니다. 제출/수량 계산 로직을 고치기 전에 `__tests__/warehouseFlow.golden.test.ts` 등 테스트와 백엔드 호출 흐름을 먼저 확인하세요.
