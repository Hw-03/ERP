---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/transaction.ts
tags: [vault, code-note, auto-generated, stub]
---

# transaction.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/transaction.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * MES 거래 (Transaction) 모듈 — `@/lib/mes/transaction`.
 *
 * Round-5 (R5-7) 신설. mes-status.ts 의 거래 관련 export 를 명시적으로 묶어
 * 본 모듈에서 단일 진입점 제공.
 *
 * 정본:
 *   - 백엔드 TransactionTypeEnum 16종 (R4-1 통일 후)
 *   - 라벨 / 톤 / 라벨 헬퍼 모두 `@/lib/mes-status` 정본
 */
export type {
  TransactionMeta,
  TransactionIconName,
} from "../mes-status";
export {
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
  transactionIconName,
  transactionColor,
} from "../mes-status";
```
