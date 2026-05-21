---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-legacy-wrapper-deprecation-plan.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-legacy-wrapper-deprecation-plan.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-legacy-wrapper-deprecation-plan.md]]

## 원본 첫 줄 (또는 메타)

```
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
```
