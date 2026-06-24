# IoConfirmStep.tsx

## 이 파일은 뭐예요?
입출고 위저드 Step 5(제출 확인) 화면을 렌더합니다. 작업 요약 배지(즉시 처리/창고 결재/부서 결재), 묶음별 확인 카드 목록, 메모 입력, 저장/제출확인 액션 푸터로 구성됩니다.

## 언제 보나요?
- Step 5로 진입해 최종 제출 전 내용을 검토할 때
- 결재가 필요한 작업(창고·부서)에서 결재 요청 버튼을 누를 때
- 재고 부족/유효하지 않은 수량이 있어 제출이 차단될 때

## 중요한 내용
- `IoConfirmStep` — 주 export. `approvalKind: "none" | "warehouse" | "department"`에 따라 배지·버튼 텍스트 분기
- `APPROVAL_META` — approvalKind별 summaryLabel/badgeText/submitText/accentColor 매핑 상수
- `ConfirmBundleCard` — Step 5 전용 읽기 전용 묶음 카드. 단품/BOM/패키지 분기 처리
- `blockerText` — 부족/0수량/미체크 조건에 따른 제출 차단 메시지
- BOM 부모 라인(`origin === "direct"`)은 묶음 헤더에서 이미 표시되어 `visibleIncludedLines`에서 제외

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — Step 5 콘텐츠로 이 컴포넌트를 소비하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `approvalKind`, `subTypeLabel`, `deptIoDisplayLabel` 소스
