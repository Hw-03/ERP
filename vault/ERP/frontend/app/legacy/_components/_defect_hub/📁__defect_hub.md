# 📁 _defect_hub

## 이 폴더는 뭐예요?

불량 재고 처리 UI 컴포넌트 모음. 창고 또는 생산부에서 불량 재고를 격리(quarantine)하거나
처리(scrap/disassemble/return)하는 워크플로의 화면 요소들이 여기에 있다.

## 언제 여기를 보나요?

- 불량 처리 화면에서 버튼/모달이 이상하게 동작할 때
- 불량 KPI 카드 수치가 틀렸을 때
- 새 불량 처리 워크타입을 추가할 때
- PA/PF 품목 BOM 분해 로직을 수정할 때

## 주요 파일

| 파일 | 역할 |
|---|---|
| `DefectHubPanel.tsx` | 불량 처리 허브 진입점. KPI 카드 + 퀵 액션 + 필터 + 목록 + 모달 분기 |
| `DefectKpiCards.tsx` | KPI 카드 4개 UI (격리 건수, 1년 이상, 결재 대기, 오늘 처리) |
| `DefectQuickActions.tsx` | 퀵 액션 버튼 (새 격리, R 반품, R 폐기) |
| `DefectFilterBar.tsx` | 범위(my/production/all) + 정렬(oldest/newest) 필터 바 |
| `DefectDepartmentList.tsx` | 부서별 격리 항목 목록 렌더링 |
| `AddQuarantineModal.tsx` | 새 격리 추가 모달 (품목 검색 → 출처/부서 → 수량 → 사유) |
| `RDefectActionModal.tsx` | R 타입 품목 처리 모달 (정상 복귀 / 폐기 / 반품) |
| `PaPfDefectWizard.tsx` | PA/PF 품목 처리 위자드 (정상 복귀 / 전부 폐기 / BOM 분해) |
| `DisassembleTree.tsx` | BOM 분해 트리 — 자식 품목별 처리 방식 결정 UI |
| `ReasonFormFields.tsx` | 사유 카테고리 + 메모 입력 공통 폼 필드 |

## 품목 종류별 모달 분기

`DefectHubPanel`이 [처리] 버튼 클릭 시 `item_code` 두 번째 segment로 분기한다:

```
item_code 예: 6-PA-0001, 6-PF-0002
                ↑↑
           parts[1] === "PA" 또는 "PF"  →  PaPfDefectWizard
           그 외 (R 등)                 →  RDefectActionModal
```

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/defects.py]] — 백엔드 격리/복귀 API 엔드포인트
- [[ERP/frontend/lib/api/defects.ts]] — API 클라이언트 (quarantine, unquarantine, listDefects, getDefectKpi)
- [[ERP/frontend/lib/api/types/defects.ts]] — DefectLocation, DefectKpi, QuarantinePayload, UnquarantinePayload 타입

> [!info]- 더 연결된 파일
> - [[ERP/frontend/lib/api/stock-requests.ts]] — PaPfDefectWizard에서 scrap/disassemble 결재 요청 생성
> - [[ERP/frontend/app/legacy/_components/_defect_hub/__tests__/]] — 단위 테스트 4종
