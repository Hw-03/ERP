---
type: file-explanation
source_path: "frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# IoComposeView.tsx — 입출고 조합 UI 본체 (데스크톱)

## 이 파일은 뭐예요?

데스크톱 입출고 화면의 핵심 컴포넌트입니다. 작업 유형 선택 → 세부 작업 → 대상 선택 → 실제 반영 → 제출까지 5단계 흐름을 담당합니다.

2022년 이후 최대 규모 파일 중 하나(900줄+)이며, 박스 차감 기능(2026-06-22~)까지 통합됐습니다.

## 언제 보나요?

- 입출고 화면 버튼·단계·수량 계산 이상이 발생할 때
- 박스 차감 흐름을 따라갈 때
- 데스크톱-모바일 동작 차이를 비교할 때

## 중요한 내용

**4 work type 분기**

| work type | 설명 | 결재 |
|---|---|---|
| `receive` | 원자재 입고 (창고 정/부만 가능) | 즉시 반영 |
| `warehouse_io` | 창고 ↔ 부서 이동 | 결재 필요 |
| `process` | 부서 내 작업 (생산/분해/수량보정) | 즉시 반영 |
| `defect` | 불량 격리/해제/처리/공급사 반품 | 즉시 반영 |

출하(ship)는 별도 work type이 아님 — `warehouse_io` 중 PF 품목이 외부로 나가는 케이스([ADR-0001](adr) 참조).

**주요 훅 구성**

- `useIoWorkState` — step·workType·subType 상태
- `useIoPreview` — 프리뷰 계산 (수량·재고 영향)
- `useIoSubmit` — 제출 + 결과 모달
- `useIoDraft` / `useIoDraftRestore` — 임시저장/복원
- `useIoUrlSync` — URL 파라미터 동기화

**`locationQuantity` 헬퍼**

IoComposeView와 MobileIoComposeWizard 양쪽에 동일한 4줄 헬퍼가 복제됨. 공용 추출 대신 복제를 유지하는 이유: 두 컴포넌트만의 사용처이고 공용 모듈 비용이 더 큼 (파일 자체 주석에 설명).

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx]] — 품목 선택 단계
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 모바일 동일 흐름
- [[ERP/frontend/lib/io/glossary.ts]] — work/sub/transaction type 라벨 단일 소스
- `_attic/docs/adr/ADR-0001-io-compose-v2-work-types.md` — 작업 유형 설계 결정

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/io.py]] — 제출 API 엔드포인트
> - [[ERP/backend/app/services/io.py]] — re-export 레이어 (실제 로직은 io_preview/persist/draft/dispatch.py)

## 조심할 점

이 파일이 크기 때문에 수정 전 훅 단위로 역할을 먼저 파악해야 합니다. 특히 `useIoSubmit`은 재고 변경을 트리거하므로, 변경 시 백엔드 io 서비스까지 함께 확인합니다.
