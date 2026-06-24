# useIoUrlSync.test.tsx

## 이 파일은 뭐예요?
`useIoUrlSync` hook을 검증하는 단위 테스트. URL `?step=N`과 IoComposeView 내부 step 상태의 양방향 동기화 동작—state 변경 시 router.push, URL 변경 시 goTo 호출, canAdvance에 따른 clamp, pendingFinalStepRef를 통한 지연 goTo—을 확인한다.

## 언제 보나요?
- `useIoUrlSync.ts` 수정 시(브라우저 뒤로/앞으로 버튼, URL 직접 입력 처리 등)
- 입출고 다단계 step 이동과 URL 히스토리 연동 로직을 이해할 때

## 중요한 내용
- `state.step` 변경 → `router.push("/path?step=N", { scroll: false })` 호출
- URL step 변경 → `goTo(N)` 호출 (단, `canAdvance[N-1]=false`이면 마지막 통과 가능 step으로 clamp)
- `urlStep === state.step`이면 goTo 미호출 (재귀 push 방지)
- `pendingFinalStepRef`: URL이 따라잡히는 순간 자동으로 예약된 step으로 goTo 실행

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoUrlSync.ts]] — 테스트 대상 hook 원본
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoWorkState.ts]] — IoStep 타입 및 canAdvance 제공
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — hook이 추출된 뷰 컴포넌트
