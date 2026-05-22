---
type: file-explanation
source_path: "_attic/docs/research/frontend-100-score-round5-review.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# frontend-100-score-round5-review.md — frontend-100-score-round5-review.md 설명

## 이 파일은 무엇을 책임지나

`frontend-100-score-round5-review.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트엔드 100점 — Round-5 종료 점수표 — 2025-04-30`
- `1. 점수 변화`
- `2. Round-5 산출물 (7건)`
- `3. 가장 큰 개선`
- `Feature boundary 70 → 80 (+10)`
- `custom hook 72 → 80 (+8)`
- `디자인 시스템 88 → 92 (+4)`
- `API layer 75 → 80 (+5)`
- `운영 정리`
- `4. 100점까지 남은 항목 (Round-6 백로그)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
```
