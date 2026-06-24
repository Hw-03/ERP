# useWarehouseScroll.ts

## 이 파일은 뭐예요?
창고 입출고 화면의 단계별(Step 1~4) 스크롤을 자동 제어하는 커스텀 훅입니다. 각 단계 완료 여부나 `forcedStep` 변경, 처리 결과(`lastResult`) 갱신 시 해당 섹션으로 부드럽게 스크롤합니다.

## 언제 보나요?
- 입출고 폼에서 단계를 완료해도 화면이 다음 단계로 이동하지 않을 때
- 스크롤 타이밍(딜레이, `requestAnimationFrame`) 조정이 필요할 때
- `forcedStep` 으로 강제 이동하는 로직을 수정할 때

## 중요한 내용
- `useWarehouseScroll({ step1Done, step2Done, forcedStep, lastResult })` — 완료 플래그와 강제이동 값을 받음
- 반환값: `{ scrollRootRef, step1Ref, step2Ref, step3Ref, step4Ref }` — 각 단계 DOM에 붙이는 ref
- `scrollToRef(ref, delay=150)` — `setTimeout` + `requestAnimationFrame` 조합으로 렌더 후 스크롤
- step1이 완료되면 step2로, step2가 완료되면 step3로 자동 이동
- `lastResult` 변경 시 step2로 되돌아가는 동작 포함(처리 완료 후 결과 확인 유도)
- `prevXxxRef` 패턴으로 이전 값과 비교해 중복 스크롤을 방지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_hooks/useWarehouseData.ts]] — 함께 사용되는 데이터 훅
