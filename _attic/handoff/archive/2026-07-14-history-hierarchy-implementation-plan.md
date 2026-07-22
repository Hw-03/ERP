# DEXCOWIN MES 입출고 이력 계층 통일 구현 계획

**GOAL:** PC 입출고 내역의 BOM, 품목 전환, 재작업, 출하 준비가 공통의 `대표 작업 행 -> 실제 재고 영향 행` 문법으로 읽히게 하고, 목록과 우측 상세의 해석을 일치시킨다.

## 실행 전략

**추천 모델: GPT-5.6 Sol** - 서로 다른 이력 원본을 공통 표현으로 바꾸고, 목록·우측 상세·취소 동선을 함께 보존해야 한다.

**추천 추론 수준: 매우 높음** - 기존 묶음·캐시·선택·키보드 접근성 동작을 유지하면서 계층 표현을 바꾸는 고위험 프런트엔드 작업이다.

**팀 구성: 불필요** - 변경이 같은 이력 표시 계층에 밀접하게 연결되어 있어 한 세션에서 순차 통합하는 편이 안전하다.

## 완료 기준

- BOM, 품목 전환, 재작업, 출하 준비를 펼치면 첫 행은 대표 작업이고 하위 행은 실제 재고 영향만 표시한다.
- BOM만 `대표 작업 -> BOM 묶음 -> 구성품 영향`의 추가 접힘 단계를 유지한다.
- 재작업의 `처리결과` 가짜 부모 행은 사라지고, 회수·재사용·폐기·부품 차감이 실제 부호 수량과 함께 표시된다.
- 품목 전환과 출하 준비는 PF/PA 처리 용어보다 실제 재고 흐름 역할이 먼저 보인다.
- 목록을 펼친 결과와 우측 상세의 영향 목록은 품목, 역할, 부호 수량, 정렬 순서가 같다.
- 요청자·승인자·메모가 함께 있는 목록 행은 세 정보가 잘리지 않는다.

## 현재 구조와 변경 경계

| 구분 | 현재 코드 | 이번 변경 방식 |
| --- | --- | --- |
| op_batch (BOM/출하 준비 등) | `HistoryTable.tsx`가 `OpBatchHeader`와 `BomBatchDetail`을 직접 연결 | 헤더 선택·캐시·BOM 접힘은 유지하고, 실제 영향 행의 역할·표현만 공통 변환기와 공통 행으로 옮긴다. |
| reference_no 묶음 (품목 전환/출하 준비 등) | `BatchHeader`와 `ReferenceBatchDetail`이 자체 로그 해석 | 참조 로그를 공통 영향 모델로 변환하고 대표 행 아래에 바로 렌더한다. |
| 재작업 | `ReworkBatchHeader`와 `ReworkBatchDetail`이 품목별 `처리결과`를 생성 | 재작업 로그를 `품목 + 실제 재고 역할` 단위로 변환해 공통 영향 행을 렌더한다. |
| 우측 상세 | `HistoryBatchDetailPanel`이 목록과 별도로 batch/log를 해석 | 목록과 같은 변환기 결과를 사용한다. 취소 액션과 상세 메타는 유지한다. |

## 표현 계약

새 화면 전용 모델을 `historyImpactPresentation.ts`에 둔다. 원본 `TransactionLog`, `IoBatch`, `IoBundle`, `IoLine`은 바꾸지 않는다.

```ts
type HistoryImpactRole =
  | "existing_item_decrease"
  | "converted_item_increase"
  | "component_recovery"
  | "additional_component_decrease"
  | "shipment_decrease"
  | "prepared_item_increase"
  | "rework_recovery"
  | "rework_reuse"
  | "rework_scrap"
  | "rework_component_decrease"
  | "bom_component_decrease"
  | "bom_component_recovery";

type HistoryImpact = {
  key: string;
  itemId: string;
  itemName: string;
  mesCode: string | null;
  role: HistoryImpactRole;
  roleLabel: string;
  signedQuantity: { label: string; tone: "increase" | "decrease" | "move" | "muted" };
  sourceLogIds: string[];
};

type HistoryImpactSection = {
  key: string;
  label: string;
  collapsible: boolean;
  impacts: HistoryImpact[];
};
```

- `HistoryImpact`는 하위 행 하나의 유일한 진실이다. 목록과 우측 상세는 이 값을 모두 사용한다.
- 재작업은 같은 품목이라도 역할이 다르면 합치지 않는다. 예를 들어 같은 품목의 회수 입고와 폐기 차감은 두 `HistoryImpact`로 남긴다.
- BOM은 `HistoryImpactSection`을 bundle 단위로 만들고 `collapsible: true`를 준다. 다른 작업은 하나의 비접힘 섹션으로 바로 렌더한다.
- 역할 라벨과 정렬은 원본 생성 시점이 아니라 이 변환기에서 결정한다. 따라서 목록과 우측 상세가 같은 문구를 사용한다.

## 작업 순서

### 1. 공통 영향 모델과 역할 매핑을 테스트 우선으로 만든다 `[GPT-5.6 Sol] [순차]`

**파일**
- 생성: `frontend/app/mes/_components/_history_sections/historyImpactPresentation.ts`
- 생성: `frontend/app/mes/_components/_history_sections/__tests__/historyImpactPresentation.test.ts`
- 수정: `frontend/app/mes/_components/_history_sections/historyPresentation.ts`
- 수정: `frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts`

1. 실패 테스트에 품목 전환, 출하 준비, 재작업, BOM의 최소 로그/batch fixture를 만든다.
2. 다음 역할과 실제 부호 수량을 검증한다.

```ts
expect(buildReferenceImpactPresentation(conversionLogs).impacts).toEqual([
  expect.objectContaining({ roleLabel: "기존 품목 차감", signedQuantity: expect.objectContaining({ label: "-1 EA" }) }),
  expect.objectContaining({ roleLabel: "구성품 회수 입고", signedQuantity: expect.objectContaining({ label: "+1 EA" }) }),
  expect.objectContaining({ roleLabel: "추가 구성품 차감", signedQuantity: expect.objectContaining({ label: "-1 EA" }) }),
  expect.objectContaining({ roleLabel: "변경 품목 입고", signedQuantity: expect.objectContaining({ label: "+1 EA" }) }),
]);
```

3. 재작업 fixture는 같은 품목에 `RECEIVE`와 `DEFECT_SCRAP`이 공존하도록 만들고, `회수 입고 +1 EA`와 `폐기 차감 -1 EA`가 별도 행인지 검증한다.
4. 구현은 원본 객체를 수정하지 않는 순수 함수로 한정한다.
   - `buildReferenceImpactPresentation(logs)`는 품목 전환·출하 준비·일반 reference 묶음을 변환한다.
   - `buildReworkImpactPresentation(logs)`는 재작업 로그를 `품목 + 역할` 키로 묶는다.
   - `buildBomImpactSections(batch)`는 기존 `getDisplayBundles`와 수량 계산 helper를 이용해 BOM 접힘 섹션을 만든다.
5. 역할의 표준 순서를 상수로 고정한다. 품목 전환은 기존품 차감, 회수 입고, 추가 차감, 변경품 입고 순서이며, 출하 준비는 출하품 차감 후 준비품 입고 순서다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/historyImpactPresentation.test.ts app/mes/_components/_history_sections/__tests__/historyPresentation.test.ts
```

### 2. 공통 하위 영향 행을 만들고 BOM 하위 행을 기준 문법으로 고정한다 `[GPT-5.6 Terra] [순차]`

**파일**
- 생성: `frontend/app/mes/_components/_history_sections/HistoryImpactRow.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx`
- 생성 또는 수정: `frontend/app/mes/_components/_history_sections/__tests__/HistoryImpactRow.test.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/BomBatchDetail.test.tsx`

1. `HistoryImpactRow`는 테이블의 하위 행 하나만 담당한다. 들여쓰기, 품목명, 품목코드, 역할, 부호 수량 pill, 부족/제외 상태를 받는다.
2. BOM의 bundle header는 그대로 남긴다. 단, bundle을 펼친 실제 구성품 행은 `HistoryImpactRow`를 통해 렌더해 이후 작업의 기준 문법으로 삼는다.
3. 포커스된 행의 `data-history-focus-line`, `aria-controls`, 키보드 접기/펼치기, 기존 상태 chip은 유지한다.
4. 테스트는 BOM bundle의 추가 접힘이 유지되고, 펼친 행이 공통 들여쓰기·역할·부호 수량을 사용하는지 검증한다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/HistoryImpactRow.test.tsx app/mes/_components/_history_sections/__tests__/BomBatchDetail.test.tsx
```

### 3. 재작업을 `처리결과`가 아닌 실제 영향 행으로 전환한다 `[GPT-5.6 Sol] [순차]`

**파일**
- 수정: `frontend/app/mes/_components/_history_sections/ReworkBatchDetail.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/ReworkBatchHeader.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/reworkSummary.ts`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/reworkSummary.test.ts`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/ReworkBatchComponents.test.tsx`

1. 현재 `buildReworkItemSummaries`의 화면 전용 `resultLabel` 의존을 제거한다. 취소/제외 정보는 대표 행 메타로 남기고, 하위에는 실제 영향만 남긴다.
2. `ReworkBatchDetail`은 공통 변환기의 `HistoryImpact[]`를 받아 `HistoryImpactRow`로 렌더한다.
3. `ReworkBatchHeader`는 대표 재작업을 한 번만 보이고, `처리결과` chip과 별도 헤더 문구는 제거한다.
4. 회수, 재사용, 폐기, 부품 차감이 함께 있는 fixture로 역할별 행과 부호 수량을 검증한다. 취소 가능한 재작업의 취소 동선과 그룹 선택 동작도 기존대로 유지되는지 검증한다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/reworkSummary.test.ts app/mes/_components/_history_sections/__tests__/ReworkBatchComponents.test.tsx app/mes/_components/_history_sections/__tests__/historyCancellation.test.ts
```

### 4. 품목 전환과 출하 준비 reference 묶음을 공통 영향 행으로 전환한다 `[GPT-5.6 Sol] [순차]`

**파일**
- 수정: `frontend/app/mes/_components/_history_sections/HistoryTable.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/ReferenceBatchDetail.tsx` (현재 실제 파일명이 다르면 해당 reference 하위 행 컴포넌트)
- 수정: `frontend/app/mes/_components/_history_sections/historyPresentation.ts`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/historyTableHelpers.test.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/historyPresentation.test.ts`

1. reference 그룹의 `BatchHeader` 선택/접기/펼치기 동작은 보존한다.
2. 펼친 하위는 `buildReferenceImpactPresentation` 결과만 렌더한다. 대표 행의 품목을 하위에 반복하지 않는다.
3. 품목 전환에서 `final PA`, `final PF` 같은 내부 용어는 역할 열의 주 문구로 사용하지 않는다. 원래 코드/보조 정보로만 남긴다.
4. 출하 준비도 실제 `출하품 차감`, `준비품 입고` 역할을 사용한다.
5. 테스트는 품목 전환·출하 준비를 각각 펼친 후 대표 행의 chevron 위치, 하위 시작선, 역할 라벨, 부호 수량, 선택 focus가 BOM 실제 구성품 행과 같은 계약을 쓰는지 검증한다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/historyTableHelpers.test.tsx app/mes/_components/_history_sections/__tests__/historyPresentation.test.ts
```

### 5. 우측 상세를 목록과 같은 영향 변환기로 연결한다 `[GPT-5.6 Sol] [순차]`

**파일**
- 수정: `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx` (reference 단건 상세와 공통 역할 라벨 사용 범위)
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/HistoryDetailPanels.test.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/DesktopHistoryRightPanel.test.tsx`

1. 우측 상세의 실제 영향 목록은 목록과 같은 `HistoryImpact[]` 또는 `HistoryImpactSection[]`을 받는다.
2. 목록의 영향 행을 선택하면 우측 상세의 같은 `sourceLogIds` 또는 item key로 포커스한다. 우측에서 행을 누르면 목록의 같은 영향 행으로 포커스하는 기존 동선을 보존한다.
3. batch 조회 실패 시에는 현재의 불가 상태와 일반 로그 상세 fallback을 유지한다.
4. 취소, 사유, 요청자, 승인자, 메모, 상태 정보는 상세 메타 영역에 남기며 영향 목록과 섞지 않는다.
5. 테스트는 품목 전환, 재작업, 출하 준비 fixture별로 목록과 우측 상세의 영향 행 배열이 같은 역할·품목코드·수량 순서를 쓰는지 검증한다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/HistoryDetailPanels.test.tsx app/mes/_components/_history_sections/__tests__/DesktopHistoryRightPanel.test.tsx
```

### 6. 요청자·승인자·메모 셀 가독성과 전체 회귀를 마무리한다 `[GPT-5.6 Terra] [순차]`

**파일**
- 수정: `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/historyTableHelpers.test.tsx`
- 수정: `frontend/app/mes/_components/_history_sections/__tests__/historyShared.golden.test.ts`

1. 요청자, 승인자, 메모가 있는 경우에만 각 줄을 렌더하고, 고정 `h-10`/`h-11` 및 부모 `overflow-hidden`을 정보량에 맞는 최소 높이로 바꾼다.
2. 행은 최대 세 줄까지만 커지며, 긴 메모 전문은 현재 title/tooltip 보조로 유지한다.
3. 요청자만 있는 행은 기존 밀도를 유지하고, 요청자·승인자·메모가 모두 있는 행은 세 값이 모두 보이는지 DOM 계약으로 테스트한다.
4. 전체 이력 테스트와 프런트엔드 검증을 실행한다.

**검증**

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_history_sections/__tests__/historyImpactPresentation.test.ts app/mes/_components/_history_sections/__tests__/HistoryImpactRow.test.tsx app/mes/_components/_history_sections/__tests__/BomBatchDetail.test.tsx app/mes/_components/_history_sections/__tests__/ReworkBatchComponents.test.tsx app/mes/_components/_history_sections/__tests__/historyTableHelpers.test.tsx app/mes/_components/_history_sections/__tests__/HistoryDetailPanels.test.tsx app/mes/_components/_history_sections/__tests__/DesktopHistoryRightPanel.test.tsx
powershell -ExecutionPolicy Bypass -File ..\scripts\dev\verify_local.ps1 -Mode frontend
```

## 브라우저 검수

1. BOM 생산 행을 펼쳐 대표 생산 작업, BOM 묶음, 실제 구성품 영향의 세 단계를 확인한다. BOM 묶음의 접기/펼치기와 키보드 동작도 확인한다.
2. 품목 전환 행을 펼쳐 기존품 차감, 회수 입고, 추가 차감, 변경품 입고 순서와 부호 수량을 확인한다.
3. 출하 준비 행을 펼쳐 출하품 차감과 준비품 입고가 PF/PA 내부 용어보다 먼저 읽히는지 확인한다.
4. 재작업 행을 펼쳐 `처리결과`가 사라지고 회수·재사용·폐기·부품 차감이 개별 실제 변화로 보이는지 확인한다.
5. 각 묶음의 우측 상세를 열어 목록과 품목, 역할, 수량, 정렬 순서가 일치하는지 확인한다.
6. 요청자·승인자·메모가 모두 있는 행과 일부만 있는 행을 비교해 메타 정보가 잘리지 않고 불필요하게 높아지지 않는지 확인한다.

## 범위 제외

- API, 백엔드 transaction schema, 과거 이력 데이터 정정은 이번 범위에서 변경하지 않는다.
- 모바일 이력 화면과 모바일 하단 탭 바는 변경하지 않는다.
- 주간보고 화면과 `backend/app/routers/inventory/weekly_report.py`는 변경하지 않는다.
- 커밋과 푸시는 별도 요청 전까지 수행하지 않는다.
