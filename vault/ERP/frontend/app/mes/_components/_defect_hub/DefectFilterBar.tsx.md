# DefectFilterBar.tsx

## 이 파일은 뭐예요?
격리 목록 화면의 필터 바 컴포넌트다. 부서 범위(내 부서/전체) 칩과 정렬(오래된순/최신순) 드롭다운을 제공한다.

## 언제 보나요?
- 불량 허브에서 "격리 목록" 뷰로 전환했을 때 목록 위에 표시됨
- `DefectHubPanel`과 데스크톱 불량 뷰 모두에서 사용

## 중요한 내용
- `DefectScope`: `"my" | "production" | "all"` — 현재 UI는 "내 부서"(my) / "전체"(all) 2개 노출
- `DefectSort`: `"oldest" | "newest"`
- `currentDept` prop: 내 부서 칩 레이블용 (실제 렌더에서는 하드코딩 "내 부서"로 표시)
- `FilterChip` 공용 컴포넌트로 부서 범위 칩 렌더링

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/FilterChip.tsx]] — 범위 선택 칩 컴포넌트
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 이 컴포넌트를 사용하는 패널
