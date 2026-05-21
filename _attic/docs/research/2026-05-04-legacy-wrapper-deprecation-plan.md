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

## 4. 점진 마이그레이션 우선순위

### Tier 1 — 작은 화면, 변경 영향 최소 (먼저)

1. `app/queue/page.tsx` (`formatNumber` 4건 — 이미 `mes-format.formatDateTime` 사용 중)
2. `app/counts/page.tsx` (`formatNumber` 6건 + `formatDateTime` 사용 중)

→ 두 파일은 이미 `@/lib/mes-format` import 하고 있으므로 `formatNumber` → `formatQty` 일괄 치환만 하면 됨.

### Tier 2 — 거래 이력 / 재고 화면 (중간)

3. `_history_sections/HistoryLogRow.tsx`, `HistoryTable.tsx`, `HistoryDetailPanel.tsx`
4. `_inventory_sections/Inventory*Panel.tsx` (5 파일)
5. `_warehouse_steps/QuantityStep.tsx`, `ItemPickStep.tsx`

### Tier 3 — 관리자 패널 (큰 컴포넌트, 다른 변경과 묶어서)

6. `AdminMasterItemsSection.tsx`
7. `AdminPackagesSection.tsx`
8. `AdminBomSection.tsx`
9. `DesktopAdminView.tsx`

### Tier 4 — 모바일 (마지막, primitives 영향)

10. `mobile/screens/HistoryScreen.tsx`, `InventoryScreen.tsx`
11. `mobile/io/dept/...`, `mobile/io/warehouse/...`
12. `mobile/primitives/ItemRow.tsx`, `PrimaryActionButton.tsx`

### Tier 5 — 정리 PR

13. `legacyUi.formatNumber` 호출처 0 도달 → wrapper export 제거
14. `legacyUi.ts` 자체 슬림화 (transactionLabel/Color 도 같이)

---

## 5. codemod 후보 (선택)

작은 변환은 수작업 PR 로 충분. 큰 일괄 변환이 필요하면:

### 5-1. `formatNumber` → `formatQty` 일괄 치환

```bash
# 단순 정규식 치환 (검증 후 적용)
rg -l "formatNumber" frontend/app/ --glob "!_archive" \
  | xargs sed -i \
    -e 's|import { \([^}]*\)formatNumber\([^}]*\) } from \(.*\)/legacyUi";|import { \1\2 } from \3/legacyUi";\nimport { formatQty as formatNumber } from "@/lib/mes-format";|' \
    -e '# 보존: formatNumber alias 유지하면 호출 변경 0'
```

→ **권장하지 않음.** alias 패턴은 가독성 손상. 차라리 import 갱신 + 호출 부분도 `formatNumber` → `formatQty` 동시 치환을 ts-morph 등으로 안전 변환.

### 5-2. ts-morph 스크립트 후보

```ts
// scripts/dev/migrate-legacy-format.ts (의사 코드)
import { Project } from "ts-morph";

const project = new Project({ tsConfigFilePath: "frontend/tsconfig.json" });
for (const file of project.getSourceFiles("frontend/app/**/*.tsx")) {
  // 1. import { formatNumber } from "../legacyUi" 식별
  // 2. import { formatQty as formatNumber } from "@/lib/mes-format" 추가
  //    또는 호출 노드까지 모두 치환
}
project.save();
```

→ **이번 라운드 외**. 별도 dev 도구 PR 로.

---

## 6. 본 PR 미수정 사항

- 본 PR (W9) 은 가이드 문서만
- `legacyUi.ts` 추가 변경 없음 (W1 wrapper 만 적용)
- 호출처 39 파일 변경 없음
- codemod 스크립트 미작성

---

## 7. 검증 / 후속 메트릭

| 지표 | 측정 명령 | 목표 |
|---|---|---|
| `formatNumber` 호출처 수 | `rg -l "formatNumber" frontend/app/ --glob "!_archive" \| wc -l` | Tier 5 진입 전 0 |
| `employeeColor` 호출처 수 | `rg -l "employeeColor" frontend/app/ --glob "!_archive" \| wc -l` | W2 정합화 후 0 |
| `transactionLabel` 호출처 수 | `rg -l "transactionLabel\(" frontend/app/ --glob "!_archive" \| wc -l` | TX-DRIFT-001 후 통합 |

매 Tier PR 마커밋에 위 수치를 첨부 → 진행도 가시화.

---

## 8. 관련 작업

- **W1** (`7913b6b`) — formatNumber wrapper 본문 위임
- **W2** (`ee82f4d`) — employeeColor wrapper 보류 + 사유 주석
- **W8** (`d122bc3`) — TransactionType 3-way 드리프트 보고서
- **TX-DRIFT-001** (예정) — 후보 A 적용 (백엔드 16개 정본 기준 통일)
