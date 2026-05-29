# ADR-0002 — 출입고 도메인 단일 사전 (`glossary.ts`)

**상태**: Accepted (2026-05-29)

## 맥락

V2 입출고 입력 / 입출고 내역 / 결재 요청 큐 / mes-status 등 여러 화면이 같은
비즈니스 동작을 서로 다른 단어로 표현하고 있었다.

대표 drift (외부 리뷰 2026-05-29 시점):
- `disassemble` → V2 "분해" / history "재작업" / history sub_type "분해 | 출고"
- `MARK_DEFECTIVE` → history "새 격리" / V2 "새 불량"
- `DEFECT_SCRAP` → history "폐기" / V2 "불량 처리"
- `TRANSFER_TO_PROD` → history "창고 반출" / V2 "창고 → 부서"
- `process` work type → history "부서 작업" / V2 "부서 입출고"

사용자가 V2 에서 누른 버튼과 history 에서 보는 라벨이 달라 "이게 그 작업 맞나?" 매번 확인.
새 라벨을 추가할 때마다 N 군데를 동기화해야 해서 drift 가 빠르게 다시 쌓임.

## 결정

**`frontend/lib/io/glossary.ts` 가 화면 라벨의 코드용 단일 소스다.**

- 키 그룹: `WORK_TYPE_LABEL`, `SUB_TYPE_LABEL`, `TRANSACTION_TYPE_LABEL`,
  `REQUEST_TYPE_LABEL`, `BUCKET_LABEL`, `SHIP_RULE`.
- 캐노니컬 라벨 선택 원칙: 사용자가 가장 자주 보는 V2 IoComposeView 의 라벨을 우선.
  모호하면 한국어 한 단어 (예: DISASSEMBLE = "분해", "재작업" 폐기).
- 기존 라벨 맵을 가진 4개 파일이 glossary 로부터 import 하도록 어댑팅:
  - `ioWorkType.ts` — IO_WORK_TYPES / IO_SUB_TYPES
  - `ioRequestLabels.ts` — REQUEST_TYPE_LABEL
  - `historyBatchInterpreter.ts` — _SUB_TYPE_OPERATION / _TX_OPERATION / _WORK_TYPE_LABEL / _SINGLE_OP verbs / _labelNoneBucket
  - `mes-status.ts` — TRANSACTION_META
- drift 방지 단위 테스트: `frontend/lib/io/__tests__/glossary.test.ts`.

사람용 사전은 `docs/GLOSSARY.md`. 두 곳은 같이 갱신해야 한다.

## 결과

**좋은 점**
- 같은 동작이 화면 어디서나 같은 단어로 보인다.
- 새 라벨 추가 = 한 파일만 수정. 어댑터들은 자동 반영.
- drift 테스트가 누락된 키를 즉시 잡아낸다.

**나쁜 점 / 주의**
- 라벨 단어를 바꾸는 변경은 사용자에게 즉시 보임 — 골든 테스트들과 함께 갱신 필요.
- "operation verb + direction hint" 같은 합성 라벨(예: "생산 | 입고")은 폐기됨 →
  방향 정보는 flowLabel 에서 별도로 표시.
- backend 의 `transaction_type` 값(`RECEIVE` 등) 자체는 본 사전과 무관 — 거래 코드는
  schema 의 책임이고 본 사전은 화면 표시만 담당.

## 관련

- ADR-0001 (work type 4개) — ship 규칙이 본 사전에 박혀 있는 이유
- `docs/GLOSSARY.md` — 사람용 사전
- `frontend/lib/io/glossary.ts` — 코드용 사전
