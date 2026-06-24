# 📁 _defect_hub

## 이 폴더는 뭐예요?

불량 처리 전용 UI 폴더입니다. "불량" 탭(`DesktopDefectView`)의 모든 UI 조각이 여기 있습니다.

불량 유형에 따라 흐름이 다릅니다:
- **PA/PF(조립/완제) 품목 불량** — `PaPfDefectWizard` / `PaPfDefectWizardPanel`
- **R(발주/원자재) 품목 불량** — `RDefectActionPanel` / `RDefectActionModal`
- **재작업(Rework) 격리** — 창고로 반환 또는 폐기
- **출고출하(disassemble) 분해** — `DisassembleTree`

## 언제 여기를 보나요?

- 불량 등록 화면이 잘못 동작할 때
- 불량 유형별 UI 흐름을 수정할 때
- 재작업 격리·폐기 처리 로직을 파악할 때

## 주요 파일

- `DefectHubEntry.tsx` — 불량 탭 최상위 진입점
- `DefectHubPanel.tsx` — 메인 패널 (필터·목록)
- `DefectItemPicker.tsx` — 불량 품목 선택
- `DefectCartFlow.tsx` — 불량 처리 장바구니 흐름
- `DefectKpiCards.tsx` — 불량 KPI 요약 카드
- `DefectFilterBar.tsx` — 필터 바
- `AddQuarantineModal.tsx` — 재작업 격리 등록 모달
- `DisassembleTree.tsx` — 출고출하 분해 트리 표시
- `reasonCategories.ts` — 불량 원인 분류 상수

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/defects.py]] — 불량 API
- [[ERP/backend/app/services/inv_defective.py]] — 불량 재고 처리 로직

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/inventory/defective.py]] — 재고 불량 엔드포인트
> - [[ERP/backend/app/services/inv_transfer.py]] — 이동 로직
