---
type: file-explanation
source_path: "_attic/docs/research/2026-05-02-execution-queue-draft.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-02-execution-queue-draft.md — 2026-05-02-execution-queue-draft.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-02-execution-queue-draft.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `실행 큐 초안 (35개 백로그 우선순위 재정렬) — 2026-05-02`
- `1. 분류 기준`
- `위험도`
- `임팩트`
- `의존성`
- `2. 35개 백로그 (재정렬)`
- `Tier 1 — 회사 PC 첫 주 (월~수, 1~10)`
- `Tier 2 — 회사 PC 둘째 주 (목~금, 11~20)`
- `Tier 3 — 회사 PC 셋째 주+ (21~30)`
- `Tier 4 — 별도 PR / 보류 (31~35)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 실행 큐 초안 (35개 백로그 우선순위 재정렬) — 2026-05-02

> **작업 ID:** MES-SAT-06 / P-SAT-06
> **작성일:** 2026-05-02 (토)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (계획 문서만)

---

## 1. 분류 기준

### 위험도

- **A**: 모바일/문서 — 실수해도 회복 쉬움
- **B**: 프론트 코드 — diff 첨부 필요
- **C**: 백엔드/스키마/프론트+백 동시 — 서버 검증 필요
- **D**: DB 마이그레이션 / PIN / 배포 — 회사 PC 한정

### 임팩트

- **高**: 50~60대 사용자 즉시 체감 / 데이터 무결성 / 인증
- **中**: UI 일관성 / 유지보수성
- **低**: 문서 정합성 / 죽은 코드 정리

### 의존성

- 선행 작업이 필요한 경우 `→ 선행 ID` 표기

---

## 2. 35개 백로그 (재정렬)

### Tier 1 — 회사 PC 첫 주 (월~수, 1~10)

| 순서 | ID | 제목 | 위험 | 임팩트 | 선행 |
|---|---|---|---|---|---|
| 1 | BE-001 | update_item process_type_code 버그 | C | 高 | — |
| 2 | BE-003 | OPERATIONS.md /health/detailed 필드 정정 | A | 中 | — |
| 3 | COMP-001 | mes-department.ts 신규 (부서 색상 단일화) | B | 高 | TREE-002 확인 |
| 4 | ADMIN-002 | items 섹션 process_type_code UI 노출 | B | 高 | BE-001 |
| 5 | COMP-005 | mes-format.ts 신규 (날짜/숫자) | B | 中 | — |
| 6 | COMP-002 | mes-status.ts 신규 (Tone 통합) | B | 中 | — |
| 7 | UI-002 | 입출고 화면 한국어 레이블 교체 | B | 高 | — |
| 8 | UI-003 | 내역 화면 부서/직원/상태 필터 추가 | B | 中 | COMP-005 |
| 9 | BE-002 | option_code VARCHAR(10) 통일 | C | 中 | — |
| 10 | BE-006 | integrity PIN POST 전환 | C | 中 | — |

### Tier 2 — 회사 PC 둘째 주 (목~금, 11~20)

| 순서 | ID | 제목 | 위험 | 임팩트 | 선행 |
|---|---|---|---|---|---|
| 11 | WAREHOUSE-001 | 입출고 화면 4단계 위저드 + 가용재고 상단 노출 | B | 高 | UI-002 |
| 12 | WAREHOUSE-002 | 예약/가용 표시 위치 적용 | B | 高 | WAREHOUSE-001 |
| 13 | HISTORY-001 | 내역 검색·필터 개선 (통합 검색) | B | 中 | UI-003 |
| 14 | HISTORY-002 | 내역 CSV 내보내기 API + 버튼 | C | 中 | — |
```
