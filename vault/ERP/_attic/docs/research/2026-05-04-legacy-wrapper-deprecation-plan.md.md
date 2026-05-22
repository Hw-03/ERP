---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-legacy-wrapper-deprecation-plan.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-legacy-wrapper-deprecation-plan.md — 2026-05-04-legacy-wrapper-deprecation-plan.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-legacy-wrapper-deprecation-plan.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Legacy wrapper deprecation 계획 — 2026-05-04`
- `1. 배경`
- `2. 현재 wrapper / 직접 import 매핑`
- `3. 정책`
- `3-1. wrapper 유지 기간`
- `3-2. 직접 import 정책`
- `3-3. 동작 차이 발견 시`
- `4. 점진 마이그레이션 우선순위`
- `Tier 1 — 작은 화면, 변경 영향 최소 (먼저)`
- `Tier 2 — 거래 이력 / 재고 화면 (중간)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# Legacy wrapper deprecation 계획 — 2026-05-04

> **작업 ID:** W9 (Round-2 보완)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 없음 (가이드 문서)

---

## 1. 배경

`mes-format` / `mes-department` / `mes-status` 모듈을 신설하면서 동일 동작을 **legacyUi 의 wrapper 로 위임**해 점진 마이그레이션 경로를 만들었다. 그러나:

- `legacyUi.formatNumber` 호출처 **39 파일** 그대로 (W1 으로 본문만 wrapper 화)
- `legacyUi.employeeColor` 호출처 **5 파일** 그대로 (W2 는 부서명 정규화 충돌로 보류)
- `legacyUi.transactionLabel` 등 거래 관련 헬퍼는 `mes-status` 와 데이터 드리프트 (→ W8 보고서)

본 가이드는 **wrapper 유지 기간 / deprecation 정책 / 점진 마이그레이션 우선순위 / codemod 후보**를 정리한다.

---

## 2. 현재 wrapper / 직접 import 매핑

| Legacy export | 신규 모듈 | wrapper 상태 | 호출처 수 |
|---|---|---|---|
| `legacyUi.formatNumber` | `mes-format.formatQty` | ✅ wrapper 화 (W1) | 39 |
| `legacyUi.employeeColor` | `mes-department.getDepartmentFallbackColor` | ❌ 보류 (W2) | 5 |
| `legacyUi.transactionLabel` | `mes-status.getTransactionLabel` | ❌ 미통합 | 다수 |
| `legacyUi.transactionColor` | `mes-status.TRANSACTION_META.tone` | ❌ 미통합 | 다수 |
| `legacyUi.normalizeDepartment` | `mes-department.normalizeDepartmentName` | ❌ 정책 충돌 | — |

---

## 3. 정책

### 3-1. wrapper 유지 기간

| 단계 | 기간 | 조건 |
|---|---|---|
| **1단계 — wrapper 유지** | 무기한 | 호출처 ≥ 5 파일이거나 동작 차이 잠재 |
| **2단계 — deprecation 경고** | 호출처 0~5 파일 도달 시 | JSDoc `@deprecated`, ESLint rule 검토 |
| **3단계 — 제거** | 호출처 0 + 1주 이상 안정 | 단일 PR 로 wrapper export 제거 |

### 3-2. 직접 import 정책

- **새 코드 작성 시:** 무조건 `@/lib/mes-format` / `@/lib/mes-department` / `@/lib/mes-status` 직접 사용
- **기존 코드 수정 시:** 같은 파일에서 다른 변경이 있을 때만 import 도 같이 갱신 (drive-by 마이그레이션)
- **단독 코드 이동만을 위한 PR 금지** — 회귀 위험만 증가

### 3-3. 동작 차이 발견 시

- W2 사례처럼 wrapper 위임이 동작 변화를 만들면 **즉시 롤백** + 사유 주석
- 정합화는 **별도 PR + 데이터 드리프트 보고서** 우선 (W8 모델)

---
```
