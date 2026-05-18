# 프론트엔드 100점 — Round-4 종료 점수표 — 2026-05-04

> **작업 ID:** R4-10
> **작성일:** 2026-05-04 (월)
> **브랜치:** `feat/hardening-roadmap`
> **Round-4 커밋 7건:** `46257cb` → `262c3fe` → `e315072` → `73b2762` → `2c6d02c` → `f0d4397` → 본 커밋

---

## 1. 점수 변화

| 카테고리 | Round-3 종료 | Round-4 종료 | Δ | 100점 기준 부족 |
|---|---|---|---|---|
| Feature boundary | 65 | **70** | +5 | 30 (실제 이동 다수) |
| API layer | 70 | **75** | +5 | 25 (도메인 분리 9 PR) |
| Type layer | 40 | **80** | +40 | 20 (각 도메인 type 별도화) |
| 디자인 시스템 | 80 | **88** | +8 | 12 (transactionColor wrapper, mes/color) |
| 거대 컴포넌트 | 55 | 55 | 0 | 45 (Round-5) |
| custom hook | 65 | **72** | +7 | 28 (Cat-C 8건 — Round-5) |
| 중복 제거 | 70 | **85** | +15 | 15 (parseError 16곳) |
| import 안정성 | 80 | **85** | +5 | 15 (점진 직접 import 전환) |
| 테스트성 | 80 | **82** | +2 | 18 (TX 16종 검증) |
| CI build | 85 | **90** | +5 | 10 (coverage gate) |
| AI 인계 | 90 | **93** | +3 | 7 (각 디렉터리 README) |
| **합산** | **780** | **875** | **+95** | **225** |
| **% (1100 만점)** | **71** | **80** | **+9** | |

---

## 2. Round-4 산출물 (7개 항목 + 1건 보류 + 2건 이월)

| ID | 작업 | 결과 | 커밋 |
|---|---|---|---|
| R4-1 | TX-DRIFT-001 (백엔드 16종 정본 통일) | ✅ | `46257cb` |
| R4-2 | `lib/api/types.ts` 분리 (492줄 이동) | ✅ | `262c3fe` |
| R4-5 | `legacyUi.transactionLabel` wrapper 위임 | ✅ | `e315072` |
| R4-6 | `employeeColor` wrapper (정규화 충돌) | ⏸ 보류 + 가이드 | `73b2762` |
| R4-7 | Cat-B exhaustive-deps 정상화 (3건) | ✅ | `2c6d02c` |
| R4-9 | Toast wrapper re-export 시범 | ✅ | `f0d4397` |
| R4-3 | `api/items.ts` 도메인 분리 | ⏭ Round-5 이월 | — |
| R4-4 | `parseError` 16곳 통합 | ⏭ Round-5 이월 | — |
| R4-8 | `mes/transaction.ts` / `color.ts` | ⏭ Round-5 이월 | — |
| R4-10 | 종료 점수표 (본 문서) | ✅ | (본 커밋) |

---

## 3. 가장 큰 개선

### Type layer 40 → 80 (+40)
- `lib/api/types.ts` 신규 (504줄)
- `api.ts` 1431 → 1039줄 (27% 감소)
- 47개 type/interface 정의가 단일 파일로 분리
- 외부 호환 100% (re-export)

### 중복 제거 70 → 85 (+15)
- `transactionLabel` 16-case switch → mes-status wrapper 1줄
- TX-DRIFT 적용으로 mes-status 가 백엔드 정본과 100% 매핑

### custom hook 65 → 72 (+7)
- exhaustive-deps disable 18 → 15 (3건 정상화)
- queue / alerts / DesktopInventoryView 의 fetch 함수가 useCallback 으로 deps 정상

---

## 4. 보류 / 이월 사유

### R4-6 보류 (employeeColor wrapper)
- legacyUi 의 `"연구"→"연구소"` 매핑과 mes-department 의 `"연구소"→"연구"` 별칭이 충돌
- 어느 쪽 위임해도 색상 변화 발생
- 부서명 정규화 정책 통일이 선행 필요 (회사 PC 데이터 확인)
- → `2026-05-04-department-naming-policy.md` 가이드 작성

### R4-3, R4-4, R4-8 이월 (Round-5)
- R4-3 (`api/items.ts` 도메인 분리): api 객체에서 items 메소드 추출 시 외부 영향 큼
- R4-4 (parseError 16곳 통합): 도메인 fetch 패턴 다양 — 검증 부담
- R4-8 (mes/transaction.ts 분리): TX-DRIFT 직후 변경은 회귀 위험

→ Round-5 첫 단계로 진입.

---

## 5. main 병합 가능 여부

### ✅ Round-4 통과

- 화면 동작 / API path / DB / frozen 식별자 영향 0
- 변경분 신규 tsc 에러 0
- TX-DRIFT 로 50~60대 사용자 즉시 영향 (영문 코드 → 한국어 라벨)
- type 분리로 후속 작업 안전

### 회사 PC 검증 (병합 전)
```bash
cd frontend
npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build
cd ../backend && pytest -q
```

→ 통과 시 **🟢 즉시 main 머지 가능**

---

## 6. Round-5 백로그 (100점 진입)

| ID | 작업 | 위험 | 점수 영향 |
|---|---|---|---|
| R5-1 | DesktopWarehouseView 837줄 분해 | C | 거대 55→75 |
| R5-2 | AdminBomSection 631줄 분해 | C | 거대 75→85 |
| R5-3 | HistoryScreen 577줄 분해 | C | 거대 85→90 |
| R5-4 | useAdminBootstrap + useWarehouseDraft (Cat-C 8곳) | C | hook 72→90 |
| R5-5 | API 도메인 분리 (items/inventory/employees/admin) | B | API 75→90 |
| R5-6 | parseError 16곳 → postJson/putJson 통합 | B | 중복 85→95 |
| R5-7 | mes/transaction.ts + color.ts 분리 | A | 디자인 88→95 |
| R5-8 | 부서명 정규화 정책 통일 + employeeColor wrapper | B | 디자인 95→100 |
| R5-9 | features/mes/ Tier 1 본문 이동 (Toast/common) | B | feature 70→85 |
| R5-10 | redirect-only 5 route 삭제 | A | tree 정리 |
| R5-11 | exhaustive-deps Cat-A 사유 주석 강화 | A | hook 90→95 |
| R5-12 | 100점 최종 검증 + main 병합 | A | — |

---

## 7. 다음 1순위 작업

**R5-1 또는 R5-5 중 선택:**

### 선택 A — R5-5 (API 도메인 분리, 위험 B)
- 구조적 효과 가장 큼
- api.ts 1039 → ~300줄
- 4 PR 분할 (items / inventory / employees / admin)

### 선택 B — R5-1 (DesktopWarehouseView 분해, 위험 C)
- 거대 컴포넌트 점수 가장 크게 상승
- 5+ 파일 분리 + 커스텀 훅
- 위험 더 큼 — UX 회귀 가능성

→ **권장: R5-5 먼저** (위험 낮고 다른 작업의 기반이 됨).

---

## 8. Round-4 누적 커밋 라인업

```
R4-1   46257cb  TX-DRIFT-001 (api 14→16, mes-status 16, legacyUi 라벨/색/아이콘)
R4-2   262c3fe  api/types.ts 분리 (492줄 이동, api.ts 27% 감소)
R4-5   e315072  legacyUi.transactionLabel → mes-status wrapper
R4-6   73b2762  department naming policy 가이드 (보류)
R4-7   2c6d02c  Cat-B exhaustive-deps 정상화 (3건, disable 18→15)
R4-9   f0d4397  features/mes/shared/Toast 첫 이동 (wrapper)
R4-10  본 커밋  점수표
```

전체 사이클 (Round-1 ~ Round-4):
```
Round-1  W1~W4 (4 commits) — 35건 분석 + 안전 보완
Round-2  W1~W10 (10 commits) — 보완 항목 (mes-format/department/status, CI build 등)
Round-3  R3-1~R3-9 (9 commits) — 진단 + barrel + 1차 분리
Round-4  R4-1~R4-10 (7 commits + 본) — TX-DRIFT + types 분리 + 정상화
```

총 **30+ 커밋**. 점수 ~55 → ~80 (Round-4 종료).
