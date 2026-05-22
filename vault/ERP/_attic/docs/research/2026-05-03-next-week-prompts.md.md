---
type: file-explanation
source_path: "_attic/docs/research/2026-05-03-next-week-prompts.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-03-next-week-prompts.md — 2026-05-03-next-week-prompts.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-03-next-week-prompts.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `다음 주 프롬프트 패키지 — 2026-05-03`
- `사용법`
- `P-MON-01 — `update_item` `process_type_code` 누락 수정 (BE-001)`
- `P-MON-02 — `/health/detailed` 문서 정정 (BE-003)`
- `P-TUE-01 — `mes-format.ts` 신규 (COMP-005)`
- `P-TUE-02 — `mes-department.ts` 신규 + 5곳 적용 (COMP-001)`
- `P-TUE-03 — `mes-status.ts` 신규 (COMP-002)`
- `P-WED-01 — 관리자 items 섹션에 `process_type_code` UI (ADMIN-002)`
- `P-WED-02 — 입출고 화면 한국어 레이블 교체 (UI-002)`
- `P-THU-01 — `option_code` 길이 통일 (BE-002)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 다음 주 프롬프트 패키지 — 2026-05-03

> **작업 ID:** MES-QA-003
> **작성일:** 2026-05-03 (일)
> **목적:** 회사 PC 첫 주 (월~금) 에 그대로 복사해서 쓸 수 있는 프롬프트 모음
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (프롬프트 템플릿)

---

## 사용법

각 프롬프트는 독립적으로 클로드에게 던질 수 있도록 자기완결로 작성됨.
- 작업 ID, 변경 파일, 검증 절차, 커밋 메시지 모두 포함
- 위험도 표기로 자가검열 가능

---

## P-MON-01 — `update_item` `process_type_code` 누락 수정 (BE-001)

```
DEXCOWIN MES, feat/hardening-roadmap.

backend/app/schemas.py 의 ItemUpdate 클래스에 process_type_code: Optional[str] = None 필드를 추가해라.
backend/app/routers/items.py 의 update_item 함수 업데이트 루프에 "process_type_code" 를 추가해라.

검증: 백엔드 재기동 후 (라우트는 @router.put — PUT 메서드)
  curl -X PUT localhost:8010/api/items/1 -H "Content-Type: application/json" -d '{"process_type_code":"AS1"}'
응답에 process_type_code 가 변경 반영되어야 한다.

커밋: "2026-05-04 backend: fix update_item process_type_code missing field"
푸시까지.

위험도: C. 다른 필드 / 다른 함수 건드리지 마라.
```

---

## P-MON-02 — `/health/detailed` 문서 정정 (BE-003)

```
DEXCOWIN MES.

docs/OPERATIONS.md 의 /health/detailed 응답 예시 블록만 정정한다.
실제 응답 키와 일치시켜라:
  database → db
  tables → rows
  open_queue_count → open_queue_batches
  latest_transaction_at → last_transaction_at
  inventory_mismatch_count 추가

backend/app/main.py 의 실제 응답을 grep 으로 확인해서 누락 없는지 검증해라.

코드는 건드리지 마라. 문서만.
커밋: "2026-05-04 docs: align /health/detailed field names with main.py"
```
