# useIoUrlSync.ts

## 이 파일은 뭐예요?
위저드 단계(step)와 URL `?step=N` 파라미터를 양방향으로 동기화하는 effect 훅입니다. 브라우저 뒤로/앞으로 버튼으로 step이 이동하고, step 2단계 이상 점프 시 중간 history 누락을 `pendingFinalStepRef`로 방지합니다.

## 언제 보나요?
- 위저드에서 뒤로가기 버튼이 이전 step으로 돌아가는 동작을 수정할 때
- 대시보드 → 창고 교차 진입 시 tab 파라미터 튕김 문제를 디버깅할 때
- `step=5` 직접 URL 진입이 canAdvance에 의해 clamp되는 로직을 확인할 때

## 중요한 내용
- `useIoUrlSync(args)` — `{ pendingFinalStepRef }` 반환
- `tabParam` — step push마다 tab 파라미터를 강제로 "warehouse"로 고정 (lagging 방지)
- `skipNextPushRef` — URL→state 동기화 직후 state→URL effect의 중복 push 1회 차단
- `pendingFinalStepRef` — Step 3→5 점프 시 step 4를 history에 먼저 쌓은 뒤 5로 이동

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — router/searchParams/pathname을 주입해 이 훅을 사용하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoWorkState.ts]] — `step`, `goTo`, `canAdvance` 소스
