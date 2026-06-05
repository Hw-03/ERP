# ADR-0005 — 결재 규칙 단일 원천 (`approval_rules.py`)

**상태**: Accepted (2026-06-04)

## 맥락

입출고 배치가 (a) 창고 결재 (b) 부서 결재 (c) 즉시 반영 중 무엇을 타는지 결정하는
규칙 상수가 여러 곳에 손으로 복제되어 있었다 — drift 위험.

- `MANUAL_LINE_ORIGINS` (낱개 라인 origin → 1라인이라도 있으면 부서 결재):
  - `backend/app/services/io_preview.py`
  - `backend/app/services/sr_validation.py`  ← **동일 집합 2벌**
  - `frontend/.../ioWorkType.ts` 의 `MANUAL_ORIGINS`  ← 3벌째(FE)
- `APPROVAL_SUB_TYPES` (창고 결재 sub_type + 불량 격리): `io_preview.py` 1벌,
  프론트 `ioWorkType.requiresApproval` 이 `warehouse_to_dept`/`dept_to_warehouse` 를 별도 하드코딩.

origin 하나, sub_type 하나만 추가해도 2~4개 파일을 동시에 고쳐야 했고, 한 곳만 바꾸면
FE/BE 가 조용히 어긋났다(deletion test: 규칙 모듈을 지우면 복잡도가 N개 호출처로 흩어짐 → 깊은 모듈).

이는 라벨 단일화([ADR-0002](ADR-0002-shared-io-glossary.md))와 **다른 축**이다 — 0002 는 화면
"라벨", 본 ADR 은 결재 "규칙(로직 상수)".

## 결정

**`backend/app/services/approval_rules.py` 가 결재 규칙 상수의 단일 원천이다.**

- 노출 상수: `MANUAL_LINE_ORIGINS`, `WAREHOUSE_APPROVAL_SUB_TYPES`(창고 결재 sub_type),
  `APPROVAL_SUB_TYPES`(= 창고 + `defect_quarantine`).
- `io_preview.py`·`sr_validation.py` 는 로컬 정의를 버리고 본 모듈에서 import(재export 체인 유지 —
  `io.py`/`io_dispatch`/`io_persist`/`stock_requests` 의 기존 import 경로 무변경).
- **FE↔BE drift 가드**: `backend/tests/test_approval_rules_drift.py` 가 `ioWorkType.ts` 의
  `MANUAL_ORIGINS`·`requiresApproval` 을 파싱해 BE 상수와 일치하는지 검사(한쪽만 바뀌면 실패).
- 동작은 바꾸지 않는다 — 상수의 위치만 단일화(프론트의 동기 UX 계산 경로 보존).

## 결과

**좋은 점**
- origin/sub_type 추가 = BE 1파일(+FE 1파일) 수정. BE 내부 2벌 복제 제거.
- FE↔BE 어긋남을 CI(pytest)가 즉시 잡는다(glossary.test.ts 와 같은 철학).
- 규칙이 한 모듈에 모여 "이 작업이 왜 결재로 가는가"를 한 곳에서 읽는다.

**나쁜 점 / 주의**
- 결재-kind 의 *최종 판정*은 여전히 StockRequest 생성(`sr_validation`/`stock_requests`)의
  `requires_warehouse/department_approval` 플래그에 분산. 본 ADR 은 *규칙 상수*만 단일화했고,
  판정 로직 자체의 단일 함수화(`determine_approval_kind`)는 도입하지 않았다(미사용 코드 회피).
  추후 그 경로를 건드릴 때 같은 모듈로 흡수 검토.
- FE 규칙을 바꾸면 drift 테스트가 빨개진다 — BE 상수도 함께 갱신해야 통과(의도된 마찰).

## 관련

- ADR-0002 (라벨 단일 사전) — 본 ADR 과 축이 다름(라벨 vs 규칙)
- `backend/app/services/approval_rules.py` — BE 단일 원천
- `backend/tests/test_approval_rules_drift.py` — FE↔BE drift 가드
- `frontend/.../ioWorkType.ts` — FE 대응(`MANUAL_ORIGINS`·`requiresApproval`)
