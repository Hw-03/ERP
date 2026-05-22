---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-transaction-type-drift.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-transaction-type-drift.md — 2026-05-04-transaction-type-drift.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-transaction-type-drift.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `거래 타입(TransactionType) 데이터 드리프트 — 2026-05-04`
- `1. 결론 (한 줄)`
- `2. 3-way 비교표`
- `3. 사용처 grep`
- `4. 영향`
- `5. 결정 후보`
- `후보 A — 백엔드 정본 기준으로 프론트 16개로 통일 (권장)`
- `후보 B — 백엔드에서 RESERVE / RESERVE_RELEASE 제거 (사용 빈도 확인 후)`
- `권장`
- `6. 본 PR 미수정 사항`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 거래 타입(TransactionType) 데이터 드리프트 — 2026-05-04

> **작업 ID:** MES-COMP-004 후속 (W8)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** 없음 (보고서만 — 실제 정합화는 별도 PR)

---

## 1. 결론 (한 줄)

`TransactionType` 정의가 **백엔드 / 프론트 api.ts / 프론트 legacyUi.ts** 3곳에서 모두 다르다. **백엔드 16개**, **프론트 api.ts 14개** (RESERVE / RESERVE_RELEASE 누락), **프론트 legacyUi.ts 11개** (TRANSFER 계열 / ...

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
| `LOSS` | ✅ | ✅ | ✅ 분실 |
| `DISASSEMBLE` | ✅ | ✅ | ✅ 분해 |
| `RETURN` | ✅ | ✅ | ✅ 반품 |
| `RESERVE` | ✅ | ❌ **누락** | ✅ 예약 |
| `RESERVE_RELEASE` | ✅ | ❌ **누락** | ✅ 예약해제 |
| `TRANSFER_TO_PROD` | ✅ | ✅ | ❌ **누락** |
| `TRANSFER_TO_WH` | ✅ | ✅ | ❌ **누락** |
| `TRANSFER_DEPT` | ✅ | ✅ | ❌ **누락** |
| `MARK_DEFECTIVE` | ✅ | ✅ | ❌ **누락** |
| `SUPPLIER_RETURN` | ✅ | ✅ | ❌ **누락** |
| **합계** | **16** | **14** | **11** |

---

## 3. 사용처 grep

```
$ rg -n "RESERVE|RESERVE_RELEASE" backend/app frontend/app frontend/lib

backend/app/models.py:69-70                — enum 정의 (정본)
frontend/app/legacy/_components/legacyUi.ts:152,154,288,290 — 라벨 / 아이콘 / 색상
frontend/app/legacy/_components/legacyUi.ts:264-265           — TransactionIconName 주석
```

→ 프론트 화면은 `RESERVE`/`RESERVE_RELEASE` 표시 코드를 가지고 있으나 `api.ts::TransactionType` 에는 없어 **TypeScript 타입 단계에서 검출 불가**. 백엔드가 이 값을 응답할 때 `transactionLabel` switch 의 default 분기로 들어가 ra...

`MARK_DEFECTIVE` / `SUPPLIER_RETURN` / `TRANSFER_*` 는 반대로 **프론트 라벨이 없어 화면에 영문 코드가 그대로** 노출.

---
```
