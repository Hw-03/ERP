# historyBatchInterpreter.ts

## 이 파일은 뭐예요?
IoBatch와 TransactionLog를 받아 화면에 표시할 라벨·흐름 설명·수량 부호·변동요약을 생성하는 순수 로직 모듈(깊은 모듈)입니다. 내부 규칙(sub_type 우선, bucket→라벨 매핑)을 은닉하고 소비자에게 단일 API를 제공합니다.

## 언제 보나요?
- `HistoryLogRow`, `historyTableHelpers`, `BomBatchDetail`, `HistoryDetailPanel`, `HistoryBatchDetailPanel` 등 history 전체 컴포넌트가 이 파일을 참조

## 중요한 내용
- `parseTransactionNotes(notes)` — 시스템 자동 노트(6종 패턴)를 제거하고 사용자 입력 메모만 추출
- `getBatchFlowEndpoints(batch)` → `BatchFlowEndpoints { from, to, mixed }` — 작업 흐름 끝점 계산
- `getHistoryDisplayLabel(log, batch?)` — 화면 정본 메인 라벨; sub_type 우선, 없으면 transaction_type
- `getHistoryActor(log)` — requester_name 우선, 없으면 produced_by에서 괄호 앞 이름
- `describeBatchFlow(log, batch?)` → `FlowDescriptor { primary, secondary? }` — 대표 라벨 + 보조 설명
- `getHistoryBomParentLine(bundle)` — BOM 번들의 부모 라인(origin="direct") 반환
- `getHistoryLineSignedQuantity(line, batch, bundle)` → `LineSignedQty { sign, label, tone, isApplied }` — BOM/op_batch 라인의 부호 + 색 결정
- `getHistoryMovementSummary(log, batch?, fallbackLogCount?)` → `MovementSummary { parts, warning? }` — 묶음 변동요약 알약 소스
- `getSingleLogMovement(log)` → `MovementSummaryPart` — 단건 변동 알약

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/io/glossary.ts]] — `SUB_TYPE_LABEL`, `TRANSACTION_TYPE_LABEL`, `WORK_TYPE_LABEL` 사전 원본
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — 이 모듈의 결과물을 UI로 변환하는 곳
