---
type: file-explanation
source_path: "_attic/docs/research/frontend-route-boundary-report.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# frontend-route-boundary-report.md — frontend-route-boundary-report.md 설명

## 이 파일은 무엇을 책임지나

`frontend-route-boundary-report.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트엔드 라우트 경계 보고서 — 2026-05-04`
- `1. 결론`
- `2. 라우트별 분류`
- `2-A. 메인 진입`
- `2-B. 활성 sub route (직접 링크됨)`
- `2-C. Redirect-only (옛 URL → /)`
- `3. 활성 / 미사용 매핑`
- `4. 보존 / 삭제 판단 가이드 (다음 작업자용)`
- `절대 삭제 금지 (이번 라운드)`
- `삭제 후보 (별도 PR + 외부 링크 점검 후)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
