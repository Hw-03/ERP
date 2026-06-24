# 📁 _warehouse_sections

## 이 폴더는 뭐예요?

창고 탭의 주요 패널 UI 모음입니다. 내 요청 확인·부서 대기열 승인·인수인계서 작성이 이 폴더에 있습니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `MyRequestsPanel.tsx` | 내 결재 요청 목록 + 수정·취소 (PIN 인증 후 revert) |
| `MyRequestRow.tsx` | 요청 한 줄 (상태·시간·"외 N건" 펼치기·수정 버튼) |
| `DepartmentQueuePanel.tsx` | 부서별 승인 대기 큐 |
| `WarehouseQueuePanel.tsx` | 창고 담당자용 승인 대기 큐 |
| `WarehouseQueueRow.tsx` | 창고 큐 한 줄 |
| `HandoverSectionPanel.tsx` | 인수인계서 목록·작성·상태 변경 |
| `HandoverComposeForm.tsx` | 인수인계서 작성 폼 |
| `DraftCartPanel.tsx` | 임시저장 장바구니 패널 |
| `DraftCartItemRow.tsx` | 임시저장 한 줄 |
| `IoDraftWorkCard.tsx` | 임시저장 작업 카드 |
| `WarehouseSectionTabs.tsx` | 창고 탭 내 서브 탭 |
| `WarehouseDraftPanelTabs.tsx` | 임시저장 패널 탭 |
| `WarehouseHeader.tsx` | 창고 탭 헤더 |
| `WarehouseAccessDenied.tsx` | 창고 접근 거부 화면 |
| `ioRequestLabels.ts` | 요청 상태·유형 레이블 상수 |
| `handoverPrint.ts` | 인수인계서 출력 유틸 |

## 언제 여기를 보나요?

- 내 요청 목록·수정·취소가 이상하게 동작할 때
- 부서/창고 승인 대기 큐 화면을 수정할 때
- 인수인계서 작성·출력 흐름을 수정할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/stock_requests.py.md]] — 결재 요청 API
- [[ERP/backend/app/routers/handover.py.md]] — 인수인계 API
- [[ERP/frontend/lib/api/stock-requests.ts.md]] — API 클라이언트

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/sr_approval.py.md]] — 승인 규칙 서비스
> - [[ERP/backend/app/services/sr_execution.py.md]] — 실행·점유 해제
