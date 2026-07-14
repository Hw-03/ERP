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
import { LEGACY_COLORS } from "@/lib/mes/color";

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
 */
export interface TransactionMeta {
  label: string;
  tone: MesTone;
}

// 라벨은 모두 glossary 단일 사전(P0-1)에서 가져옴. tone 만 본 모듈에서 정의.
import { TRANSACTION_TYPE_LABEL as _TX_LABEL } from "@/lib/io/glossary";

export const TRANSACTION_META: Record<TransactionType, TransactionMeta> = {
  RECEIVE: { label: _TX_LABEL.RECEIVE, tone: "success" },
  PRODUCE: { label: _TX_LABEL.PRODUCE, tone: "info" },
  SHIP: { label: _TX_LABEL.SHIP, tone: "info" },
  ADJUST: { label: _TX_LABEL.ADJUST, tone: "warning" },
  BACKFLUSH: { label: _TX_LABEL.BACKFLUSH, tone: "info" },
  DISASSEMBLE: { label: _TX_LABEL.DISASSEMBLE, tone: "danger" },
  TRANSFER_TO_PROD: { label: _TX_LABEL.TRANSFER_TO_PROD, tone: "info" },
  TRANSFER_TO_WH: { label: _TX_LABEL.TRANSFER_TO_WH, tone: "info" },
  TRANSFER_DEPT: { label: _TX_LABEL.TRANSFER_DEPT, tone: "info" },
  MARK_DEFECTIVE: { label: _TX_LABEL.MARK_DEFECTIVE, tone: "danger" },
  UNMARK_DEFECTIVE: { label: _TX_LABEL.UNMARK_DEFECTIVE, tone: "success" },
  DEFECT_SCRAP: { label: _TX_LABEL.DEFECT_SCRAP, tone: "danger" },
  SUPPLIER_RETURN: { label: _TX_LABEL.SUPPLIER_RETURN, tone: "danger" },
  INTERNAL_USE: { label: _TX_LABEL.INTERNAL_USE, tone: "danger" },
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

/**
 * 거래 타입별 lucide-react 아이콘 이름 (Round-10D #4 정본 이전).
 *
 * 5.5-G: 색상-only 신호를 두 채널(색+아이콘)로 보강하기 위한 WCAG 1.4.1 대응.
 * 아이콘 import 는 호출측에서 처리 — 본 모듈은 이름만 반환 (트리쉐이킹 영향 최소화).
 */
export type TransactionIconName =
  | "ArrowDownToLine"   // RECEIVE
  | "ArrowUpFromLine"   // SHIP
  | "Sliders"           // ADJUST
  | "Hammer"            // PRODUCE
  | "Recycle"           // BACKFLUSH
  | "Wrench"            // DISASSEMBLE
  | "ArrowRightLeft"    // TRANSFER_TO_PROD / TRANSFER_TO_WH / TRANSFER_DEPT
  | "ShieldAlert"       // MARK_DEFECTIVE
  | "Undo2"             // UNMARK_DEFECTIVE
  | "Trash2"            // DEFECT_SCRAP
  | "PackageX"          // SUPPLIER_RETURN
  | "Activity";         // 기타 / 기본

/**
 * 거래 타입 → 표시 색상.
 *
 * Round-10F (#3) 정본 이전. 기존 legacyUi.transactionColor 본문 그대로 흡수.
 * TRANSACTION_META.tone 시스템과는 별도의 색 매핑 (구체적 hex / CSS var 반환).
 *
 * `tone` (semantic) vs 본 함수 (concrete color) 의 분리 유지 — UI 가 hex 가 필요한
 * 일부 위치 (history badge bg, calendar dot 등) 에서 본 함수를 호출.
 */
export function transactionColor(type: TransactionType | string): string {
  switch (type) {
    case "RECEIVE":
      return LEGACY_COLORS.green;
    case "SHIP":
      return LEGACY_COLORS.red;
    case "ADJUST":
      return LEGACY_COLORS.yellow;
    case "PRODUCE":
      return LEGACY_COLORS.cyan;
    case "BACKFLUSH":
      return "#fb923c";
    case "UNMARK_DEFECTIVE":
      return LEGACY_COLORS.green;
    case "MARK_DEFECTIVE":
    case "DEFECT_SCRAP":
    case "SUPPLIER_RETURN":
    case "INTERNAL_USE":
      return LEGACY_COLORS.red;
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return LEGACY_COLORS.blue;
    case "DISASSEMBLE":
      return LEGACY_COLORS.red;
    default:
      return LEGACY_COLORS.muted2;
  }
}

export function transactionIconName(type: TransactionType | string): TransactionIconName {
  switch (type) {
    case "RECEIVE":
      return "ArrowDownToLine";
    case "SHIP":
      return "ArrowUpFromLine";
    case "ADJUST":
      return "Sliders";
    case "PRODUCE":
      return "Hammer";
    case "BACKFLUSH":
      return "Recycle";
    case "DISASSEMBLE":
      return "Wrench";
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return "ArrowRightLeft";
    case "MARK_DEFECTIVE":
      return "ShieldAlert";
    case "UNMARK_DEFECTIVE":
      return "Undo2";
    case "DEFECT_SCRAP":
      return "Trash2";
    case "SUPPLIER_RETURN":
      return "PackageX";
    case "INTERNAL_USE":
      return "ArrowUpFromLine";
    default:
      return "Activity";
  }
}
