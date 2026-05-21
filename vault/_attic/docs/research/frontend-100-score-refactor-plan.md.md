---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/frontend-100-score-refactor-plan.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# frontend-100-score-refactor-plan.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/frontend-100-score-refactor-plan.md]]

## 원본 첫 줄 (또는 메타)

```
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

```
