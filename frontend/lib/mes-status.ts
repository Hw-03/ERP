/**
 * DEXCOWIN MES 공통 상태 톤 / 거래 타입 매핑
 *
 * 통합 정책:
 *   - 데스크톱 StatusPill 의 tone (info/success/warning/danger/neutral) 과
 *     모바일 StatusBadge 의 tone (ok/warn/danger/info/muted) 을
 *     단일 MesTone 체계로 흡수한다.
 *   - 1차 (이번 PR): StatusPill 만 본 모듈 사용. StatusBadge 는 다음 PR.
 *   - 두 컴포넌트 자체는 합치지 않는다 — props / 마크업 호환성 유지.
 *
 * 호환:
 *   - StatusPill 의 기존 export `StatusPillTone` 은 MesTone 의 alias 로 유지.
 *   - StatusBadge 의 "ok" / "warn" 은 success / warning 의 별칭으로 toMesTone 이 흡수.
 */

import type { TransactionType } from "@/lib/api";

export type MesTone = "success" | "warning" | "danger" | "info" | "neutral" | "muted";

/**
 * StatusBadge 등 구버전 톤 명을 MesTone 으로 흡수.
 * 모르는 값은 "info" 로 떨어뜨린다.
 */
export function toMesTone(value: string | null | undefined): MesTone {
  if (!value) return "info";
  switch (value) {
    case "success":
    case "ok":
      return "success";
    case "warning":
    case "warn":
      return "warning";
    case "danger":
      return "danger";
    case "info":
      return "info";
    case "neutral":
      return "neutral";
    case "muted":
      return "muted";
    default:
      return "info";
  }
}

/**
 * 자유 텍스트 상태 → MesTone 추론.
 * StatusPill.inferToneFromStatus 의 동작을 그대로 보존한다.
 */
export function inferTone(status: string | null | undefined): MesTone {
  if (!status) return "info";
  if (status === "DEXCOWIN MES System") return "neutral";
  if (status.startsWith("방금 완료")) return "success";
  if (/실패|오류|불러오지 못|에러/.test(status)) return "danger";
  if (/주의|경고|부족|품절/.test(status)) return "warning";
  return "info";
}

/**
 * 거래 타입 메타 — 라벨 + 톤.
 *
 * 라벨은 frontend/app/legacy/_components/legacyUi.ts::transactionLabel 과
 * 동일하게 유지한다 (점진 마이그레이션 — 이번 PR 에선 그쪽도 그대로 둔다).
 */
export interface TransactionMeta {
  label: string;
  tone: MesTone;
}

export const TRANSACTION_META: Record<TransactionType, TransactionMeta> = {
  RECEIVE: { label: "입고", tone: "success" },
  PRODUCE: { label: "생산입고", tone: "info" },
  SHIP: { label: "출고", tone: "info" },
  ADJUST: { label: "조정", tone: "warning" },
  BACKFLUSH: { label: "자동차감", tone: "info" },
  SCRAP: { label: "폐기", tone: "danger" },
  LOSS: { label: "분실", tone: "danger" },
  DISASSEMBLE: { label: "분해", tone: "neutral" },
  RETURN: { label: "반품", tone: "neutral" },
  RESERVE: { label: "예약", tone: "warning" },
  RESERVE_RELEASE: { label: "예약해제", tone: "muted" },
  TRANSFER_TO_PROD: { label: "생산이동", tone: "info" },
  TRANSFER_TO_WH: { label: "창고이동", tone: "info" },
  TRANSFER_DEPT: { label: "부서이동", tone: "info" },
  MARK_DEFECTIVE: { label: "불량격리", tone: "danger" },
  SUPPLIER_RETURN: { label: "공급반품", tone: "neutral" },
};

/**
 * 거래 타입 → MesTone (없는 키는 "info").
 */
export function getTransactionTone(type: TransactionType | string): MesTone {
  return TRANSACTION_META[type as TransactionType]?.tone ?? "info";
}

/**
 * 거래 타입 → 한국어 라벨 (없는 키는 입력 그대로).
 */
export function getTransactionLabel(type: TransactionType | string): string {
  return TRANSACTION_META[type as TransactionType]?.label ?? String(type);
}
