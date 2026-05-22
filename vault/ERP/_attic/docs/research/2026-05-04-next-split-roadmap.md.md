---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-next-split-roadmap.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-next-split-roadmap.md — 2026-05-04-next-split-roadmap.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-next-split-roadmap.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `다음 분할 로드맵 — 2026-05-04`
- `1. 목적`
- `2. 분할 트랙 3종`
- `2-A. API 도메인 분리 (총 5 PR)`
- `2-B. DesktopAdminView 후속 분리 (총 4 PR)`
- `2-C. transactionLabel / transactionColor → mes-status 위임 (1 PR, TX-DRIFT-001 후행)`
- `3. 의존성 그래프`
- `4. 권장 PR 순서 (상위 우선)`
- `5. 위험도 / 영향 매트릭스`
- `6. 본 PR 미수정 사항`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 다음 분할 로드맵 — 2026-05-04

> **작업 ID:** W10 (Round-2 보완)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 없음 (로드맵 문서)

---

## 1. 목적

Round-1 (9건) + Round-2 (10건) 후 진행 중인 분할 작업이 여러 문서에 흩어져 있다. 본 문서는:

- API 도메인 분리 다음 단계
- DesktopAdminView 후속 컴포넌트 분리
- transactionLabel / transactionColor → mes-status 위임
- 관련 의존성 / 위험도 / PR 순서

를 한 곳에 모은다. PIN 마이그레이션은 별도 (`pin-security-migration-plan.md`).

---

## 2. 분할 트랙 3종

### 2-A. API 도메인 분리 (총 5 PR)

api.ts (현재 1450줄) → 도메인별 파일.

| PR | 신규 파일 | 이동 대상 | 위험 |
|---|---|---|---|
| API-1 | `frontend/lib/api-types.ts` | `ProcessTypeCode`, `TransactionType`, `LocationStatus`, enum/literal union | A |
| API-2 | `frontend/lib/api-types-models.ts` | `Item`, `Employee`, `Department`, `ProductModel`, `ShipPackage` 등 interface | B |
| API-3 | `frontend/lib/api/items.ts` | `api.getItems`, `getItem`, `createItem`, `updateItem`, `deleteItem` | C |
| API-4 | `frontend/lib/api/inventory.ts` | `api.receive`, `ship`, `adjust`, `transfer*`, `getInventorySummary` | C |
| API-5 | `frontend/lib/api/admin.ts`, `employees.ts`, `queue.ts` | 나머지 도메인 | C |

**호환:**
- `frontend/lib/api.ts` 가 모든 도메인 API 를 spread 머지하여 동일 export (`api`)
- 외부 호출처 (`@/lib/api` import) 변경 0
- `parseError` 16곳 직접 사용은 점진적으로 `postJson`/`putJson` 으로 통합 (별도 PR API-6 후보)

**의존성:**
- 모든 PR 은 `api-core.ts` (이미 `7bd9e91` 에서 분리) 에 의존
- API-1 → API-2 → API-3,4,5 순서

---

### 2-B. DesktopAdminView 후속 분리 (총 4 PR)

`DesktopAdminView.tsx` 의 잔존 인라인 컴포넌트 (W5 의 DeptManagementPanel 분리 후 4개 남음).

| PR | 분리 대상 | 신규 경로 | 위험 |
|---|---|---|---|
| ADMIN-COMP-1 | `OverviewBar` | `_admin_sections/OverviewBar.tsx` | B |
| ADMIN-COMP-2 | `SidebarButton` | `_admin_sections/SidebarButton.tsx` | A (presentational) |
```
