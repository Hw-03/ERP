# glossary.test.ts

## 이 파일은 뭐예요?
`frontend/lib/io/glossary.ts`의 도메인 사전(레이블·설명·규칙)이 의도치 않게 바뀌는 것을 방지하는 drift 방지 테스트 파일입니다. IoWorkType·IoSubType·TransactionType 키 완전성, 캐노니컬 라벨 고정, interpretShipLabel 출하 판별 규칙을 세 블록으로 나눠 검증합니다.

## 언제 보나요?
- 출입고 도메인 사전(`glossary.ts`)을 수정한 뒤 테스트가 깨졌을 때 — 어떤 라벨/키가 변경됐는지 파악할 때
- 새 IoWorkType·IoSubType·TransactionType 열거값을 추가할 때 사전 등록 누락을 확인할 때

## 중요한 내용
- `glossary — 키 완전성`: `WORK_TYPE_LABEL`, `SUB_TYPE_LABEL`, `TRANSACTION_TYPE_LABEL`, `REQUEST_TYPE_LABEL`, `BUCKET_LABEL` 각각 키가 빠짐없이 등록됐는지 검사
- `glossary — 캐노니컬 라벨 고정`: "분해"·"불량" 계열·방향 화살표("창고 → 부서") 등 화면 표시 문자열이 특정 값으로 고정됨을 단언
- `interpretShipLabel — 출하 규칙`: PF/PA/PR 품목 + `transactionType=SHIP` + `fromBucket=warehouse` + `toBucket=none` 조합만 `"출하"` 반환; 나머지는 `null`
- `SHIP_RULE.workTypeShouldNotExist === true`: V2 compose 화면에 ship 버튼을 추가하면 안 됨을 코드로 못 박음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/io/glossary.ts]] — 이 테스트가 직접 검증하는 사전 파일
