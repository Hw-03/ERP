# DefectHubPanel.test.tsx

## 이 파일은 뭐예요?
불량 허브 패널(`DefectHubPanel`)을 검증하는 테스트 파일입니다. KPI 카드 렌더링, 부서별 그룹핑, 1년 초과 배지, 필터 동작, 카드 클릭 시 화면 전환(격리 목록·다품목 카트·처리 패널)을 확인합니다.

## 언제 보나요?
- `DefectHubPanel` 컴포넌트를 수정할 때 회귀 여부 확인
- KPI 필터(`defectDeptFilter` prop), 1년 초과 배지 로직, 허브 카드 라우팅이 바뀔 때

## 중요한 내용
- `defectsApi.getDefectKpi`, `defectsApi.listDefects` 모킹
- `MobileDefectProcessPanel`, `MobileDefectCartFlow`는 stub으로 대체해 내부 API 호출 차단
- 허브 첫 화면에 카드 3장("격리 목록"·"불량 격리"·"바로 폐기"); "격리 목록" 클릭으로 list 화면 진입
- `defectDeptFilter` prop: 초기 부서 필터 강제 지정 기능 검증
- 400일 경과 항목 "1년 초과" 배지, 200일 항목 배지 없음 대조 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 테스트 대상 컴포넌트
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx]] — stub 처리된 처리 패널
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx]] — stub 처리된 다품목 카트
