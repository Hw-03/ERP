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
