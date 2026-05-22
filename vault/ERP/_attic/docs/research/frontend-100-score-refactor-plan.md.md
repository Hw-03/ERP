---
type: file-explanation
source_path: "_attic/docs/research/frontend-100-score-refactor-plan.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# frontend-100-score-refactor-plan.md — frontend-100-score-refactor-plan.md 설명

## 이 파일은 무엇을 책임지나

`frontend-100-score-refactor-plan.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `프론트엔드 100점 리팩토링 진단 리포트 — 2026-05-04`
- `1. 현재 점수 (작업 전 기준)`
- `2. 100점 기준 점수표`
- `3. 현재 구조 문제 TOP 20`
- `4. 절대 건드리면 안 되는 파일/식별자`
- `Frozen 식별자`
- `Frozen 디렉터리`
- `Frozen route`
- `Frozen API`
- `5. 안전한 리팩토링 순서 (이번 라운드)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 프론트엔드 100점 리팩토링 진단 리포트 — 2026-05-04

> **작성:** 2026-05-04 (월)
> **브랜치:** `feat/hardening-roadmap`
> **목적:** 1단계 진단. 실제 리팩토링은 본 리포트의 "안전 순서" 섹션을 따라 단계별 진행.

---

## 1. 현재 점수 (작업 전 기준)

| 카테고리 | 점수 (100 만점) | 비고 |
|---|---|---|
| Feature boundary 명확성 | **45** | `legacy/_components/` 단일 트리, feature 경계 약함 |
| API layer 분리도 | **55** | api-core 분리됨. 도메인 / 타입 / API 객체 한 파일 (1431줄) |
| Type layer 분리도 | **35** | api.ts 안에 200+ 타입 혼재 |
| 디자인 시스템 일관성 | **70** | mes-format/department/status 도입. wrapper 일부, 중복 잔존 |
| 거대 컴포넌트 축소 | **40** | DesktopWarehouseView 837 / Admin 631 / 모바일 HistoryScreen 577 |
| custom hook 분리 | **60** | exhaustive-deps disable 18곳, 데이터 hook 일부만 |
| 중복 제거 | **65** | format=wrapper, color=차이 발견(W2 보류), tx=드리프트 |
| import 경로 안정성 | **75** | `@/lib/api` 광범위 사용. api 분리시 호환 wrapper 필요 |
| 테스트 가능성 | **65** | mes-* 단위 테스트 존재. api-core / 통합 미작성 |
| CI build 안정성 | **80** | lint+tsc+vitest+build 4단계 통과 가능 |
| AI 인계 용이성 | **70** | 다수 보고서 (drift, deprecation, roadmap) 존재 |
| **합산** | **610 / 1100 ≈ 55점** | |

---

## 2. 100점 기준 점수표

| 카테고리 | 100점 기준 |
|---|---|
| Feature boundary | `frontend/features/<도메인>/` 명확. 이동 90% 완료 |
| API layer | `lib/api/<도메인>.ts` 분리 + barrel re-export. api.ts 200줄 이하 |
| Type layer | `lib/api/types.ts` 단일 — 도메인별 타입 흩어짐 0 |
| 디자인 시스템 | `lib/mes/` 단일 디렉터리. legacyUi 의 헬퍼 100% wrapper |
| 거대 컴포넌트 | 250줄 초과 0. 1개 파일 1책임 |
| custom hook | exhaustive-deps disable 5건 이하. 모두 사유 주석 |
| 중복 제거 | TX-DRIFT 통일. employeeColor 단일 소스. 모바일/데스크톱 동일 tone |
| import 경로 | barrel 안정. `@/lib/api` `@/lib/mes` 를 통한 import 90% |
| 테스트 | api-core/error parser/url builder/format/dept/status 모두 커버 |
| CI build | build 평균 60초 이내, 캐시 적용 |
| AI 인계 | 모든 디렉터리 README 또는 진단 보고서 존재 |

---

## 3. 현재 구조 문제 TOP 20

| # | 문제 | 영향 | 위험 |
|---|---|---|---|
| 1 | `lib/api.ts` 1431줄 단일 파일 (212 export/메소드) | 유지보수, 타입 추적, 바뀔 위험 | C |
| 2 | api.ts 안 타입 정의 200+ 줄 — 도메인별 타입 미분리 | type safety | B |
| 3 | `DesktopWarehouseView.tsx` 837줄 / useState 다수 | 거대 컴포넌트 | C |
| 4 | `DesktopAdminView.tsx` 631줄 (DeptManagementPanel 분리 후에도) | 동일 | B |
| 5 | `AdminBomSection.tsx` 631줄 | 동일 | C |
| 6 | `mobile/screens/HistoryScreen.tsx` 577줄 | 동일 | C |
```
