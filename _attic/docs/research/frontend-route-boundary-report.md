# 프론트엔드 라우트 경계 보고서 — 2026-05-04

> **작업 ID:** R3-8
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 분석만. 코드 변경 0.

---

## 1. 결론

10개 route 중:
- **메인 진입 1개** (`app/page.tsx` → `legacy/page.tsx`)
- **활성 sub route 4개** (alerts, counts, queue + legacy)
- **redirect-only 5개** (admin, inventory, history, bom, operations)

redirect-only 5개는 사용자가 옛 북마크 / 외부 링크로 접근 시 정상 안내. **이번 라운드는 삭제 금지** — 향후 외부 링크 갱신 후 별도 PR.

---

## 2. 라우트별 분류

### 2-A. 메인 진입

| 경로 | 본문 | 분류 |
|---|---|---|
| `app/page.tsx` | `export { default } from "./legacy/page"` | **메인 진입** — `/` 접근 시 legacy/page.tsx 직접 렌더 |
| `app/legacy/page.tsx` | "use client" + 전체 MES UI (모바일 + 데스크톱 분기) | **legacy 정본** |

### 2-B. 활성 sub route (직접 링크됨)

| 경로 | 링크 출처 | 용도 | 분류 |
|---|---|---|---|
| `app/alerts/page.tsx` | `_components/AlertsBanner.tsx`, `AlertsSheet.tsx` | 안전재고 / 변동 알림 목록 | **활성** |
| `app/counts/page.tsx` | `_components/AlertsSheet.tsx` (모바일) | 실사 등록 화면 | **활성** |
| `app/queue/page.tsx` | `_components/AlertsSheet.tsx` (모바일) | 큐 배치 모니터 | **활성** |

### 2-C. Redirect-only (옛 URL → /)

| 경로 | 본문 | 외부 링크 가능성 | 분류 |
|---|---|---|---|
| `app/admin/page.tsx` | `redirect("/")` | 옛 북마크 | **redirect 유지** |
| `app/inventory/page.tsx` | `redirect("/")` | 동일 | **redirect 유지** |
| `app/history/page.tsx` | `redirect("/")` | 동일 | **redirect 유지** |
| `app/bom/page.tsx` | `redirect("/")` | `_archive` AppHeader 가 참조 (활성 미참조) | **redirect 유지** |
| `app/operations/page.tsx` | `redirect("/")` | 동일 | **redirect 유지** |

---

## 3. 활성 / 미사용 매핑

| 종류 | 갯수 | 파일 |
|---|---|---|
| 메인 진입 | 1 | `app/page.tsx` |
| Legacy 정본 | 1 | `app/legacy/page.tsx` |
| 활성 sub | 3 | alerts / counts / queue |
| Redirect-only | 5 | admin / inventory / history / bom / operations |
| **합계** | **10** | |

`frontend/components/AppHeader.tsx`, `CategoryCard.tsx`, `UKAlert.tsx` — `_archive/standalone-app-routes/` 만 참조 (활성 코드 0). 별도 노트.

---

## 4. 보존 / 삭제 판단 가이드 (다음 작업자용)

### 절대 삭제 금지 (이번 라운드)

- `app/page.tsx` — root entry
- `app/legacy/page.tsx` — UI 정본
- `app/alerts/`, `app/counts/`, `app/queue/` — 모바일 AlertsSheet 와 데스크톱 AlertsBanner 가 직접 link

### 삭제 후보 (별도 PR + 외부 링크 점검 후)

- `app/admin/page.tsx`, `app/inventory/page.tsx`, `app/history/page.tsx`
- `app/bom/page.tsx`, `app/operations/page.tsx`
- `frontend/components/AppHeader.tsx`, `CategoryCard.tsx`, `UKAlert.tsx`

### 조건

1. nginx / proxy / 사용자 북마크 / 카카오톡 공유 / 외부 문서에서 위 5개 URL 참조 0건 확인
2. Google Analytics / 액세스 로그 1주일 이상 0 hit 확인
3. 그 후 한 PR 에서 `app/<삭제>` + 관련 `_components` 정리

---

## 5. legacy 명칭 / 경로 정리 정책

### 현재 상태
- `app/legacy/` — UI 본체. `legacy` 라는 이름이지만 실제 정본
- `app/legacy/_components/` — 거의 모든 컴포넌트 (40+ 파일)

### 변경 정책 (이번 라운드는 미수정)
- `legacy/` 디렉터리 자체는 그대로 둔다 — 이름 변경 시 모든 import 파괴
- 대신 새 코드는 `frontend/features/mes/` 로 (R3-4 placeholder)
- `app/legacy/page.tsx` → `app/(legacy)/page.tsx` 로 옮길 수도 있으나 Round-4 이후

### 다음 작업자에게
- 새 컴포넌트는 `frontend/features/mes/<feature>/` 에 두기
- 기존 `app/legacy/_components/` 의 컴포넌트를 옮길 때 wrapper re-export 부터
- 마지막 사용처 정리 후 일괄 삭제

---

## 6. 향후 정리 후보 (Round-4 이상)

| ID | 작업 | 위험 |
|---|---|---|
| ROUTE-1 | redirect-only 5개 삭제 (외부 링크 점검 후) | A |
| ROUTE-2 | `frontend/components/` 3 파일 삭제 | A |
| ROUTE-3 | `app/legacy/page.tsx` → `app/(legacy)/page.tsx` | B (URL 영향) |
| ROUTE-4 | `app/legacy/_components/` → `frontend/features/mes/` 이동 | C (대규모 import 변경) |

---

## 7. 검증 체크리스트 (회사 PC)

- [ ] `npx next build` — 모든 route 빌드 성공 (CI 에서 자동)
- [ ] `/admin`, `/inventory`, `/history`, `/bom`, `/operations` 접근 시 `/` 로 리다이렉트
- [ ] `/alerts`, `/counts`, `/queue` 접근 시 정상 화면
- [ ] `/` (메인) → `app/legacy/page.tsx` 직접 렌더

---

## 8. 관련 보고서

- `2026-05-01-folder-classification.md` — 폴더 분류
- `2026-05-02-ui-screen-analysis.md` — TREE-003 라우트 분석
- `frontend-100-score-refactor-plan.md` — Round-3 진단
- `2026-05-04-next-split-roadmap.md` — Round-4 계획
