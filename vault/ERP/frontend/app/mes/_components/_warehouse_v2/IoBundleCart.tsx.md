# IoBundleCart.tsx

## 이 파일은 뭐예요?
Step 4(실제 반영) 화면에서 카트에 담긴 모든 묶음(IoBundle) 목록을 보여주고 수량 조정·제출확인 진행을 지원하는 컨테이너 컴포넌트입니다. 반영 라인 수·총 수량 배지, 재고 부족 경고, "창고에서 가져오기" 버튼, 저장+제출확인 액션 푸터를 포함합니다.

## 언제 보나요?
- Step 4(실제 반영) 화면에서 카트 목록을 볼 때
- 모바일에서 Step 4에서도 임시저장 버튼이 필요할 때 (`onSaveDraft` prop 전달)
- 생산(produce) 4단계에서 재고 부족 라인에 "창고에서 가져오기" 버튼이 보일 때

## 중요한 내용
- `IoBundleCart` — 주 export. `onSaveDraft` prop 있으면 "저장+제출확인" 나란히, 없으면 제출확인만
- `pullEnabled` / `pullSelected` / `onTogglePull` / `onPullFromWarehouse` — 창고 가져오기 기능 세트
- 모바일 sticky 푸터: `sticky bottom-0 z-20 -mx-3 ... lg:static` 패턴으로 네비바 위 고정

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoBundleCard.tsx]] — 각 묶음 카드 렌더
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — Step 4 콘텐츠로 이 컴포넌트를 소비하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/pullFromWarehouse.ts]] — "창고에서 가져오기" 부족 라인 item_id 추출 로직
