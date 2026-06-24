# useIoPreselect.test.tsx

## 이 파일은 뭐예요?
`useIoPreselect` hook을 검증하는 단위 테스트. IoComposeView에서 추출한 preselectedItem 자동 적용 hook으로, 일반 품목이면 addItem 자동 호출, BOM 부모면 하이라이트만, bomParentsLoaded=false일 때 보류하는 분기를 확인한다.

## 언제 보나요?
- `useIoPreselect.ts` 수정 시(BOM 부모 판정, process 방향 게이트, loaded race 가드 등)
- 스캔/클릭으로 넘어온 preselectedItem이 자동 적용되는 조건을 확인할 때

## 중요한 내용
- 일반 품목 → `addItem(item)` + `setHighlightItemId(null)` 호출
- BOM 부모(`bomParents` Set 포함) → `addItem` 미호출 + `setHighlightItemId(item_id)` 호출
- `bomParentsLoaded=false` → 아무 분기도 실행하지 않음 (S1 race 결함 가드)
- `process` workType + `deptIoDirection=null` → 자동 적용 보류
- workType 변경 시 같은 품목이라도 재적용 (handled key에 workType 포함)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useIoPreselect.ts]] — 테스트 대상 hook 원본
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — hook이 추출된 뷰 컴포넌트
