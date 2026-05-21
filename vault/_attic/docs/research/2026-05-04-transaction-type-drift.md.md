---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-04-transaction-type-drift.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-04-transaction-type-drift.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-04-transaction-type-drift.md]]

## 원본 첫 줄 (또는 메타)

```
# 거래 타입(TransactionType) 데이터 드리프트 — 2026-05-04

> **작업 ID:** MES-COMP-004 후속 (W8)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 없음 (보고서만 — 실제 정합화는 별도 PR)

---

## 1. 결론 (한 줄)

`TransactionType` 정의가 **백엔드 / 프론트 api.ts / 프론트 legacyUi.ts** 3곳에서 모두 다르다. **백엔드 16개**, **프론트 api.ts 14개** (RESERVE / RESERVE_RELEASE 누락), **프론트 legacyUi.ts 11개** (TRANSFER 계열 / MARK_DEFECTIVE / SUPPLIER_RETURN 누락).

---

## 2. 3-way 비교표

| 코드 | backend `TransactionTypeEnum` (models.py:59) | frontend `TransactionType` (api.ts:15) | frontend `transactionLabel` (legacyUi.ts:118) |
|---|:-:|:-:|:-:|
| `RECEIVE` | ✅ | ✅ | ✅ 입고 |
| `PRODUCE` | ✅ | ✅ | ✅ 생산입고 |
| `SHIP` | ✅ | ✅ | ✅ 출고 |
| `ADJUST` | ✅ | ✅ | ✅ 조정 |
| `BACKFLUSH` | ✅ | ✅ | ✅ 자동차감 |
| `SCRAP` | ✅ | ✅ | ✅ 폐기 |
```
