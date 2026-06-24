# glossary.ts

## 이 파일은 뭐예요?
출입고(IO) 도메인 전체에서 사용하는 화면 라벨의 단일 사전입니다. V2 입력 화면·내역·요청 큐·history KPI에서 같은 비즈니스 동작이 서로 다른 단어로 표기되던 문제(P0-1)를 해결하기 위해 만들어졌으며, 모든 라벨은 이 파일 한 곳에서 정의합니다.

## 언제 보나요?
- 입출고 화면에서 작업 유형(WorkType)·세부 유형(SubType)·거래 유형(TransactionType)의 한국어 라벨을 바꿔야 할 때
- 새로운 `IoSubType` 또는 `TransactionType` 값이 추가되어 라벨을 등록해야 할 때
- "분해"를 "재작업"이라 부르는 등 라벨 불일치가 의심될 때

## 중요한 내용
- `WORK_TYPE_LABEL` / `WORK_TYPE_DESCRIPTION` — `IoWorkType` 4종(receive·warehouse_io·process·defect) 라벨
- `SUB_TYPE_LABEL` / `SUB_TYPE_DESCRIPTION` — `IoSubType` 12종 라벨 (V2 입력 흐름의 최소 단위)
- `TRANSACTION_TYPE_LABEL` — DB `TransactionLog.transaction_type` 13종 라벨 (`DISASSEMBLE`="분해", `DEFECT_SCRAP`="불량 처리" 등 이전 표기 정정 주석 포함)
- `REQUEST_TYPE_LABEL` — 결재 요청 큐(`stock_requests.request_type`) 라벨 (string 키)
- `SHIP_RULE` — "출하"는 별도 work type이 아니라 PF 계열 품목이 창고 → 외부로 나갈 때만 해석됨
- `interpretShipLabel(opts)` — SHIP 거래가 실제 "출하"인지 판정하는 함수 (PR/PA/PF + fromBucket=warehouse + toBucket=none 조건)
- `BUCKET_LABEL` — `IoBucket` 4종(warehouse·production·defective·none) 라벨
- `listAllSubTypes()` / `listAllTransactionTypes()` / `listAllWorkTypes()` — drift 검사용 헬퍼 (glossary.test.ts에서 사용)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/io.ts]] — `IoBucket`, `IoSubType`, `IoWorkType` 타입 정의
- [[ERP/frontend/lib/api/types/shared.ts]] — `TransactionType` 타입 정의
- [[ERP/frontend/lib/io/__tests__/glossary.test.ts]] — 이 사전의 completeness drift 검사 테스트
