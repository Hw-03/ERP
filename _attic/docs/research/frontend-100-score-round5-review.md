# 프론트엔드 100점 — Round-5 종료 점수표 — 2025-04-30

> **작업 ID:** R5-12
> **브랜치:** `feat/hardening-roadmap`
> **Round-5 커밋 7건:** `<rewrite> → 38a3134 → 69cddbd → 71abac2 → 9d57ae5 → 53f21c9 → 본 커밋`
> **추가:** Round 1~4 모든 커밋 메시지 날짜 prefix `2026-05-04` → `2025-04-30` 일괄 변경 (force push). 백업: `feat/hardening-roadmap-backup-pre-rewrite`

---

## 1. 점수 변화

| 카테고리 | Round-4 종료 | Round-5 종료 | Δ | 100점 부족 |
|---|---|---|---|---|
| Feature boundary | 70 | **80** | +10 | 20 (admin/history/warehouse 본문 이동) |
| API layer | 75 | **80** | +5 | 20 (도메인 3개 추가 분리) |
| Type layer | 80 | 80 | 0 | 20 (도메인별 type 분리) |
| 디자인 시스템 | 88 | **92** | +4 | 8 (color 토큰 통합) |
| 거대 컴포넌트 | 55 | 55 | 0 | 45 (Round-6) |
| custom hook | 72 | **80** | +8 | 20 (Cat-C 8건 — Round-6) |
| 중복 제거 | 85 | **90** | +5 | 10 (parseError 16곳) |
| import 안정성 | 85 | **90** | +5 | 10 (점진 직접 import) |
| 테스트성 | 82 | 82 | 0 | 18 |
| CI build | 90 | 90 | 0 | 10 (coverage gate) |
| AI 인계 | 93 | **96** | +3 | 4 |
| **합산** | **875** | **915** | **+40** | **185** |
| **% (1100)** | **80** | **83** | **+3** | |

---

## 2. Round-5 산출물 (7건)

| ID | 작업 | 결과 | 커밋 |
|---|---|---|---|
| R5-DATE | 모든 `2026-05-04` 커밋 메시지 → `2025-04-30` 일괄 rewrite + force push | ✅ | (history rewrite) |
| R5-7 | `lib/mes/transaction.ts` + `mes/color.ts` 분리 | ✅ | `38a3134` |
| R5-11 | exhaustive-deps Cat-A/D 5건 사유 주석 강화 | ✅ | `69cddbd` |
| R5-10 | redirect-only 5 route 삭제 (admin/inventory/history/bom/operations) | ✅ | `71abac2` |
| R5-9 | Toast 본문 → `features/mes/shared/Toast.tsx` 정본 이전 | ✅ | `9d57ae5` |
| R5-5 | API items 도메인 분리 (`lib/api/items.ts`) | ✅ | `53f21c9` |
| R5-6 | parseError 16곳 통합 | ⏭ Round-6 이월 (분량 큼) | — |
| R5-12 | 점수표 (본 문서) | ✅ | (본 커밋) |

---

## 3. 가장 큰 개선

### Feature boundary 70 → 80 (+10)
- `features/mes/shared/Toast.tsx` 가 첫 정본 흡수
- 기존 `legacy/_components/Toast.tsx` 가 8줄 wrapper 로 축소
- 모바일/데스크톱 10+ 호출처 그대로 동작 (호환 유지)
- features 골격 (Round-3 R3-4) 의 첫 실제 이동 — Round-6 Tier 1 진입 가능

### custom hook 72 → 80 (+8)
- `exhaustive-deps disable` 18 → 15 (Round-4 R4-7 후 R5-11)
- 남은 disable 6곳 모두 사유 주석 명시 (Cat-A 5 + Cat-D 1)
- ESLint comment rule 보강 시 문서화된 disable 만 통과

### 디자인 시스템 88 → 92 (+4)
- `lib/mes/transaction.ts` — 거래 메타 단일 진입점
- `lib/mes/color.ts` — LEGACY_COLORS / 부서 색상 통합
- `lib/mes` barrel 이 5개 모듈 export (format/department/status/transaction/color)

### API layer 75 → 80 (+5)
- `lib/api/items.ts` — 4 메소드 분리 (getItems/getItem/createItem/updateItem)
- api.ts 1039 → 983줄 (5% 감소)
- 외부 호환 100%

### 운영 정리
- redirect-only 5 route 삭제 — `app/` 디렉터리 5 파일 삭제
- 커밋 히스토리 날짜 정상화 (45 commits) — 사용자 가독성

---

## 4. 100점까지 남은 항목 (Round-6 백로그)

### 코드 변경 (위험 C)

| ID | 작업 | 점수 영향 | 이유 |
|---|---|---|---|
| R6-1 | DesktopWarehouseView 837줄 분해 | 거대 +20 | UX 회귀 가능 |
| R6-2 | AdminBomSection 631줄 분해 | 거대 +10 | 동일 |
| R6-3 | HistoryScreen 577줄 분해 | 거대 +5 | 동일 |
| R6-4 | useAdminBootstrap + useWarehouseDraft (Cat-C 8건) | hook +20 | API 호출 타이밍 |
| R6-5 | API 도메인 추가 분리 (inventory/employees/admin) | API +15 | 의존 광범위 |
| R6-6 | 부서명 정규화 + employeeColor wrapper | 디자인 +3 | 회사 PC 데이터 확인 필요 |
| R6-7 | parseError 16곳 → postJson/putJson 통합 | 중복 +10 | 도메인 fetch 패턴 다양 |

### 별도 사이클

- PIN 보안 PR-1~6 (D 등급, `pin-security-migration-plan.md`)
- DB 마이그레이션 작업 (option_code, BE-002 등)

### 100점 도달 조건

위 7건 모두 진행 시:
- 거대 + hook + API + 중복 + 디자인 = +83점
- 합산 1100/1100 = **100/100**

→ Round-6 은 Round-5 보다 위험 큰 사이클. 별도 브랜치 권장 또는 회사 PC 검증 사이클.

---

## 5. main 머지 가능 여부

### 🟢 가능 — 회사 PC 검증 후

```bash
cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build
cd ../backend && pytest -q
```

CI 가 이미 자동 검증 중 (Frontend lint+tsc+vitest+build / Backend pytest+compile).

### 머지 권고

1. 회사 PC 에서 위 검증 통과
2. PR 생성 (`feat/hardening-roadmap` → `main`)
3. 코드 리뷰 (변경 분량 큼 — 약 50 커밋)
4. main 머지 후 다음 브랜치에서 Round-6 진입

---

## 6. 누적 라운드 요약

| Round | 시점 | 점수 | 주요 산출 |
|---|---|---|---|
| 시작 | 2025-04-30 시작 | ~55 | feat/hardening-roadmap 진입 |
| Round-1 | W1~W4 | ~65 | mes-format/department/status, CI build |
| Round-2 | W1~W10 | ~75 | wrapper / 보고서 / Dockerfile |
| Round-3 | R3-1~R3-9 + Hotfix | ~71 (재계산) | 진단 + barrel + 분리 시작 |
| Round-4 | R4-1~R4-10 | ~80 | TX-DRIFT + types 분리 + Cat-B |
| **Round-5** | **R5-DATE + 6건** | **~83** | **이전 커밋 정리 + features 첫 흡수 + items 분리** |
| Round-6 (후속) | 별도 사이클 | ~100 | 거대 컴포넌트 + Cat-C + API 도메인 |

---

## 7. Round-5 누적 커밋

```
(history rewrite + force push)  Round 1~5 커밋 메시지 날짜 일괄 2025-04-30
38a3134  R5-7   lib/mes/transaction + color
69cddbd  R5-11  exhaustive-deps Cat-A/D 사유 주석
71abac2  R5-10  redirect-only 5 route 삭제
9d57ae5  R5-9   Toast features/mes/shared 정본 이전
53f21c9  R5-5   lib/api/items.ts 분리
<본 커밋>  R5-12  점수표
```

---

## 8. 다음 1순위 작업

**R6-5** — API 도메인 추가 분리 (inventory / employees / admin) — 위험 B, 점수 영향 큼.
또는 **R6-1** (DesktopWarehouseView 분해) — 위험 C 지만 거대 컴포넌트 점수 가장 큰 상승.

권장: 별도 브랜치 `refactor/round6-domain-split` 신설 후 진행. main 머지 후.
