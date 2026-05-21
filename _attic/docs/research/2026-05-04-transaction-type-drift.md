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

→ 프론트 화면은 `RESERVE`/`RESERVE_RELEASE` 표시 코드를 가지고 있으나 `api.ts::TransactionType` 에는 없어 **TypeScript 타입 단계에서 검출 불가**. 백엔드가 이 값을 응답할 때 `transactionLabel` switch 의 default 분기로 들어가 raw 코드 그대로 표시되거나, `legacyUi.ts:288,290` 처럼 따로 매칭된 부분에서만 처리.

`MARK_DEFECTIVE` / `SUPPLIER_RETURN` / `TRANSFER_*` 는 반대로 **프론트 라벨이 없어 화면에 영문 코드가 그대로** 노출.

---

## 4. 영향

| 시나리오 | 결과 |
|---|---|
| 사용자가 예약 거래 발생 시 화면 | `transactionLabel` 이 "예약" 반환 (legacyUi 만 정의되어 OK) |
| 사용자가 부서 이동 거래 발생 시 화면 | `transactionLabel` default → "TRANSFER_DEPT" 영문 표시 |
| 신규 컴포넌트가 `mes-status.TRANSACTION_META` 사용 | 백엔드 16개 중 14개만 매핑 — RESERVE / RESERVE_RELEASE 가 default ("info" 톤) 으로 떨어짐 |
| 50~60대 현장 사용자 | "TRANSFER_DEPT" 같은 영문 코드를 그대로 봄 — 가독성 저하 |
| TypeScript 안정성 | `tx.transaction_type === "RESERVE"` 같은 비교가 타입 에러 → 단순 string 비교로 우회 |

---

## 5. 결정 후보

### 후보 A — 백엔드 정본 기준으로 프론트 16개로 통일 (권장)

- `frontend/lib/api.ts::TransactionType` 에 `RESERVE` / `RESERVE_RELEASE` 추가 (2건)
- `frontend/lib/mes-status.ts::TRANSACTION_META` 에도 2건 추가 (`예약`/`예약해제` + tone)
- `frontend/app/legacy/_components/legacyUi.ts::transactionLabel` 의 누락 5건 (TRANSFER_TO_PROD/WH, TRANSFER_DEPT, MARK_DEFECTIVE, SUPPLIER_RETURN) 추가
- 동일하게 `transactionColor`, `transactionIconName` 도 보강

**위험:** B (프론트 enum / 라벨 추가만, 백엔드 변경 0)
**산출물:** `api.ts` 1줄, `mes-status.ts` 2줄, `legacyUi.ts` 라벨/색상/아이콘 각 5건

### 후보 B — 백엔드에서 RESERVE / RESERVE_RELEASE 제거 (사용 빈도 확인 후)

- 운영 DB 의 `transactions` 테이블에 RESERVE / RESERVE_RELEASE 데이터 존재 여부 SELECT
- 0건이면 enum 에서 제거, 코드 경로도 정리
- 0건 아니면 후보 A 선택 강제

**위험:** D (DB 마이그레이션 가능성, 거래 이력 사라지면 안 됨)

### 권장

**후보 A 진행.** RESERVE / RESERVE_RELEASE 가 백엔드에 살아있는 한 프론트는 표시 책임이 있다. 후보 B 는 백엔드 코드 cleanup 시 별도 검토.

---

## 6. 본 PR 미수정 사항

본 보고서는 **분석만**. 수정은:

- `frontend/lib/api.ts` — 타입 enum 변경 (다음 PR)
- `frontend/lib/mes-status.ts::TRANSACTION_META` — 2건 추가 (다음 PR)
- `frontend/app/legacy/_components/legacyUi.ts` — 라벨/색상/아이콘 각 5건 추가 (다음 PR)
- `backend` — 변경 없음 (운영 정본 보존)

---

## 7. 회사 PC 검증 항목 (수정 PR 진입 전)

- [ ] `SELECT transaction_type, COUNT(*) FROM transactions GROUP BY transaction_type;` — 16개 코드 모두 발생하는지 / RESERVE 류 데이터 건수 확인
- [ ] `MARK_DEFECTIVE` / `SUPPLIER_RETURN` / `TRANSFER_*` 가 실제 화면에 영문 그대로 표시되는지 시각 확인
- [ ] BackgroundFlush 등 자동 처리 거래에서 어떤 타입이 사용되는지 매핑 확인
- [ ] 후보 A 진입 시 프론트 vitest `mes-status.test.ts` 의 14키 검증을 16키로 보강

---

## 8. 관련 작업

- W4 (StatusBadge → toMesTone) — 본 보고서가 발견한 불일치는 W4 와 무관, 별도 후속 PR
- W5 (mes-status 단위 테스트) — 16키 통일 시 테스트도 갱신 필요
- 다음 라운드 백로그에 추가: **TX-DRIFT-001** (후보 A 적용)
