# 📁 __tests__

## 이 폴더는 뭐예요?
`_defect_hub` 컴포넌트들의 Vitest 단위 테스트 모음입니다. 불량 격리 추가, 처리(복귀/폐기/분해), 다품목 카트, 허브 패널 전반의 UI 상호작용과 API 호출 페이로드를 검증합니다.

## 언제 여기를 보나요?
- `_defect_hub` 컴포넌트를 수정한 뒤 회귀 테스트가 통과하는지 확인할 때
- 불량 처리 API(`defectsApi`, `stockRequestsApi`) 시그니처가 바뀌어 테스트를 업데이트할 때

## 주요 파일
- `PaPfDefectWizard.test.tsx` — PA/PF 불량 처리 마법사(분해/복귀/폐기 3경로) 검증
- `RDefectActionModal.test.tsx` — 원자재 불량 처리 모달(복귀/폐기/반품) 검증
- `AddQuarantineModal.test.tsx` — 단일 품목 격리 추가 모달 검증
- `DefectCartFlow.test.tsx` — 다품목 격리·바로 폐기 카트 흐름 검증
- `DefectHubPanel.test.tsx` — 허브 패널 KPI·필터·화면 전환 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/📁__defect_hub]] — 테스트 대상 컴포넌트 루트
