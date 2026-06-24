# 📁 _bom_workbench

## 이 폴더는 뭐예요?
관리자 화면의 "BOM 관리" 기능을 구성하는 모든 컴포넌트와 유틸이 모여 있는 폴더. 품목 간 부모-자식 자재 구성(Bill of Materials)을 편집하고, 특정 품목이 어느 BOM에 쓰이는지 역참조하며, 완료 처리·JSON·CSV 내보내기까지 처리한다.

## 언제 여기를 보나요?
- 관리자가 BOM 자재 구성을 추가·수정·삭제할 때 관련된 파일을 찾을 때
- "완료/작업중/미착수" KPI 통계나 상태 필터 로직을 수정할 때
- 부서·단계 코드(`process_type_code`) 파싱 방식을 이해하고 싶을 때

## 주요 파일
- `BomWorkbench.tsx` — 최상위 오케스트레이터. CRUD·내보내기·모달 제어 담당
- `bomDept.ts` — 부서/단계 파싱 유틸 + BOM 상태 계산 순수 함수 모음
- `BomParentList.tsx` — 좌측 부모 품목 리스트 (필터·검색 포함)
- `BomChildAddBox.tsx` — 가운데 자식 추가 패널 (인라인 수량 입력)
- `BomEditPanel.tsx` — 우측 현재 BOM 구성 목록
- `BomWhereUsedPanel.tsx` — "사용처" 모드: 역참조 결과 패널
- `BomStatsRow.tsx` — 상단 KPI 카드 4장 + 상태 필터 컨트롤
- `BomParentHeader.tsx` — 부서 탭 옆 선택된 부모 헤더 카드
- `BomReviewModal.tsx` — 검토·완료 처리 모달 (수량/중복 사전 검증)
- `BomUnmatchedRawsDrawer.tsx` — 하단 미배치 원자재 확인 서랍
- `BomRow.tsx` — BOM 구성 리스트 개별 행 (인라인 수량 편집·삭제)
- `BomBadge.tsx` — 부서+단계 코드 배지 (`HA`, `TR` 등)
- `BomSearchInput.tsx` — 품목명/코드 검색 입력 필드

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `getBOM`, `createBOM`, `updateBOM`, `deleteBOM`, `updateBomCompletion`, `getBOMWhereUsed`
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/📁__admin_primitives]] — `AdminPageHeader`, `AdminKpiBar`
- [[ERP/frontend/lib/mes-department.ts]] — `getDepartmentFallbackColor`
