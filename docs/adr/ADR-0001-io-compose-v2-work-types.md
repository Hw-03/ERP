# ADR-0001 — IoCompose V2 의 work type 은 4개

**상태**: Accepted (2026-05-29)

## 맥락

DEXCOWIN MES 의 V2 입출고 화면(`frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx`)은
사용자가 작업 종류를 4개 중 하나로 시작한다:

- `receive` — 원자재 입고
- `warehouse_io` — 창고 ↔ 부서
- `process` — 부서 내 작업 (생산/분해/수량보정)
- `defect` — 불량 격리/해제/처리/반품

외부 코드 리뷰(2026-05-29)에서 "사용자가 5개를 기대(+ 출하)하는데 4개만 보여 혼란"
이라는 지적이 있었고, `TransactionLog` 에는 `SHIP` 거래 타입이 존재하므로 정책 모순으로
보일 수 있다.

## 결정

**V2 compose 에 `ship` work type 을 추가하지 않는다.**

- 출하는 별도 작업이 아니라 `warehouse_io` 의 출고 케이스다 (사용자 확인 2026-05-27).
- 정확히는 품목의 `process_type_code ∈ {PR, PA, PF}` (PF 계열 = 완제품) + 창고에서 외부로
  나가는 방향이면 "출하" 로 해석한다.
- 이 규칙은 `frontend/lib/io/glossary.ts` 의 `interpretShipLabel()` 에 코드로 박혀 있고,
  `SHIP_RULE.workTypeShouldNotExist = true` 플래그가 의도를 명시한다.
- 사람용 설명은 `docs/GLOSSARY.md` 의 "출하 규칙" 섹션.

## 결과

**좋은 점**
- V2 작업 선택 화면이 4개로 단순하게 유지된다.
- "출하" 와 "출고" 의 구분은 품목 분류로 자동 결정 — 사용자가 매번 고민할 필요 없음.

**나쁜 점 / 주의**
- 신규 개발자/리뷰어가 SHIP 거래만 보면 "왜 ship work type 이 없지?" 라고 묻게 됨 →
  본 ADR 과 GLOSSARY 가 답해야 함.
- 향후 출하 전용 화면(완제품 배송 일정, 거래처 라벨 출력 등)이 필요해지면 본 결정을
  뒤집고 별도 ADR 작성.

## 관련

- ADR-0002 (단일 사전) — ship 규칙이 사전에 박혀 있는 이유
- `frontend/lib/io/glossary.ts` `SHIP_RULE`, `interpretShipLabel()`
- `docs/GLOSSARY.md` 출하 규칙
