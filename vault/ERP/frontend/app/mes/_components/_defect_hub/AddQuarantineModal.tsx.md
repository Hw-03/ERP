# AddQuarantineModal.tsx

## 이 파일은 뭐예요?
정상 재고에서 품목을 격리 등록하는 모달 컴포넌트다. 품목 검색, 출처(창고/부서) 선택, 격리 대상 부서, 수량, 사유를 입력해 `defectsApi.quarantine`을 즉시 호출한다(결재 불필요).

## 언제 보나요?
- 불량 탭에서 "불량 격리" 단품 모달 경로로 진입할 때
- `createPortal`로 `document.body`에 렌더, z-index 450

## 중요한 내용
- `SourceKind`: `"warehouse" | "production"` — 창고 재고 vs 부서 재고
- 창고 출처: `target_dept` 선택(어느 부서 불량 구역으로 보낼지)
- 부서 출처: `source_dept = target_dept` 자동 (같은 부서 안에서 격리)
- 품목 검색: 200ms debounce, `useMyItemOrderQuery`로 직원 커스텀 정렬 반영
- `defectsApi.quarantine` 호출 시 `source`, `source_dept`(부서 출처면), `target_dept` 전달
- `useFocusTrap`, ESC 닫기 지원

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx]] — 다품목 격리 카트 흐름
- [[ERP/frontend/app/mes/_components/_defect_hub/ReasonFormFields.tsx]] — 사유 폼
- [[ERP/frontend/lib/api/defects]] — quarantine API
- [[ERP/frontend/lib/queries/useMyItemOrderQuery.ts]] — 직원 품목 커스텀 순서 쿼리
