---
type: file-explanation
source_path: "_attic/docs/research/frontend-100-score-round6-review.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# frontend-100-score-round6-review.md — frontend-100-score-round6-review.md 설명

## 이 파일은 무엇을 책임지나

`frontend-100-score-round6-review.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트엔드 100점 — Round-6 종료 점수표 — 2025-04-30`
- `1. 점수 변화`
- `2. Round-6 산출물`
- `3. API 분리 누적 효과`
- `4. 90점 도달 미달 — 추가 작업 필요`
- `가장 빠른 길 (위험 B 이하)`
- `권장: R6 추가 진행 (5건)`
- `5. main 머지 가능 여부`
- `🟢 Round-6 까지 — 가능`
- `6. 다음 1순위`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 프론트엔드 100점 — Round-6 종료 점수표 — 2025-04-30

> **작업 ID:** R6-12
> **브랜치:** `feat/hardening-roadmap`
> **Round-6 커밋 5건:** `b64c050` → `cc6c846` → `3549484` → `5a92786` → 본 커밋

---

## 1. 점수 변화

| 카테고리 | Round-5 종료 | Round-6 종료 | Δ |
|---|---|---|---|
| Feature boundary | 80 | 80 | 0 |
| API layer | 80 | **92** | **+12** |
| Type layer | 80 | 80 | 0 |
| 디자인 시스템 | 92 | 92 | 0 |
| 거대 컴포넌트 | 55 | 55 | 0 |
| custom hook | 80 | 80 | 0 |
| 중복 제거 | 90 | **92** | +2 |
| import 안정성 | 90 | **92** | +2 |
| 테스트성 | 82 | 82 | 0 |
| CI build | 90 | 90 | 0 |
| AI 인계 | 96 | **97** | +1 |
| **합산** | **915** | **932** | **+17** |
| **% (1100)** | **83** | **85** | **+2** |

---

## 2. Round-6 산출물

| ID | 작업 | 결과 | 커밋 |
|---|---|---|---|
| R6-D1 | API inventory 도메인 분리 (11 메소드) | ✅ | `b64c050` |
| R6-D2 | API employees 도메인 분리 (6 메소드) | ✅ | `cc6c846` |
| R6-D3 | API admin / settings 도메인 분리 (3 메소드) | ✅ | `3549484` |
| R6-D4 | API queue 도메인 분리 (9 메소드) | ✅ | `5a92786` |
| R6-W1/W2 | 거대 컴포넌트 분해 | ⏭ Round-7 (위험 C, useState 11+) |
| R6-P1 | parseError 16곳 통합 | ⏭ Round-7 (도메인 추가 분리 우선) |
| R6-12 | 점수표 (본 문서) | ✅ |

---

## 3. API 분리 누적 효과

```
api.ts 변화:
  Round-3 시작:  1431줄 (단일 거대 파일)
  R3-2 (barrel): 1431 (변화 없음, barrel 만 추가)
  R4-2 (types):  1039 (-392, 27% 감소)
  R5-5 (items):   983 (-56)
  R6-D1 (inv):    824 (-159, 16% 감소)
  R6-D2 (emp):    760 (-64)
  R6-D3 (admin):  734 (-26)
  R6-D4 (queue):  646 (-88)
  -----------
```
