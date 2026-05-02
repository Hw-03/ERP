import { describe, it, expect } from "vitest";
import {
  toMesTone,
  inferTone,
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
  transactionColor,
  type MesTone,
} from "../mes-status";
import { LEGACY_COLORS } from "../mes/color";

describe("toMesTone", () => {
  it("동일한 키는 그대로", () => {
    expect(toMesTone("success")).toBe("success");
    expect(toMesTone("warning")).toBe("warning");
    expect(toMesTone("danger")).toBe("danger");
    expect(toMesTone("info")).toBe("info");
    expect(toMesTone("neutral")).toBe("neutral");
    expect(toMesTone("muted")).toBe("muted");
  });

  it("StatusBadge 별칭 흡수: ok→success, warn→warning", () => {
    expect(toMesTone("ok")).toBe("success");
    expect(toMesTone("warn")).toBe("warning");
  });

  it("null/공백/모르는 값은 info", () => {
    expect(toMesTone(null)).toBe("info");
    expect(toMesTone(undefined)).toBe("info");
    expect(toMesTone("")).toBe("info");
    expect(toMesTone("nonsense")).toBe("info");
  });
});

describe("inferTone", () => {
  it("DEXCOWIN MES System 은 neutral", () => {
    expect(inferTone("DEXCOWIN MES System")).toBe("neutral");
  });

  it("'방금 완료' prefix 는 success", () => {
    expect(inferTone("방금 완료된 작업")).toBe("success");
  });

  it("실패/오류/에러는 danger", () => {
    expect(inferTone("실패했습니다")).toBe("danger");
    expect(inferTone("오류 발생")).toBe("danger");
    expect(inferTone("에러: 코드 500")).toBe("danger");
    expect(inferTone("불러오지 못했습니다")).toBe("danger");
  });

  it("주의/경고/부족/품절은 warning", () => {
    expect(inferTone("주의 필요")).toBe("warning");
    expect(inferTone("경고")).toBe("warning");
    expect(inferTone("재고 부족")).toBe("warning");
    expect(inferTone("품절 임박")).toBe("warning");
  });

  it("기본은 info", () => {
    expect(inferTone("일반 메시지")).toBe("info");
    expect(inferTone(null)).toBe("info");
    expect(inferTone(undefined)).toBe("info");
  });
});

describe("TRANSACTION_META", () => {
  it("api.ts TransactionType 16키 모두 정의 (TX-DRIFT-001 적용 후)", () => {
    const required = [
      "RECEIVE", "PRODUCE", "SHIP", "ADJUST", "BACKFLUSH",
      "SCRAP", "LOSS", "DISASSEMBLE", "RETURN",
      "RESERVE", "RESERVE_RELEASE",
      "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT",
      "MARK_DEFECTIVE", "SUPPLIER_RETURN",
    ];
    for (const key of required) {
      const meta = TRANSACTION_META[key as keyof typeof TRANSACTION_META];
      expect(meta).toBeDefined();
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it("tone 값이 모두 유효한 MesTone", () => {
    const valid: MesTone[] = ["success", "warning", "danger", "info", "neutral", "muted"];
    for (const meta of Object.values(TRANSACTION_META)) {
      expect(valid).toContain(meta.tone);
    }
  });
});

describe("getTransactionLabel / getTransactionTone", () => {
  it("정의된 타입 — 매핑 반환", () => {
    expect(getTransactionLabel("RECEIVE")).toBe("입고");
    expect(getTransactionTone("RECEIVE")).toBe("success");
    expect(getTransactionLabel("SCRAP")).toBe("폐기");
    expect(getTransactionTone("SCRAP")).toBe("danger");
  });

  it("미지 타입 — 라벨은 입력 그대로, 톤은 info", () => {
    expect(getTransactionLabel("UNKNOWN_KEY")).toBe("UNKNOWN_KEY");
    expect(getTransactionTone("UNKNOWN_KEY")).toBe("info");
  });
});

describe("transactionColor", () => {
  it("정상 거래 → green/blue/cyan", () => {
    expect(transactionColor("RECEIVE")).toBe(LEGACY_COLORS.green);
    expect(transactionColor("PRODUCE")).toBe(LEGACY_COLORS.cyan);
    expect(transactionColor("TRANSFER_TO_PROD")).toBe(LEGACY_COLORS.blue);
    expect(transactionColor("TRANSFER_TO_WH")).toBe(LEGACY_COLORS.blue);
    expect(transactionColor("TRANSFER_DEPT")).toBe(LEGACY_COLORS.blue);
  });

  it("위험 거래 → red", () => {
    expect(transactionColor("SHIP")).toBe(LEGACY_COLORS.red);
    expect(transactionColor("SCRAP")).toBe(LEGACY_COLORS.red);
    expect(transactionColor("LOSS")).toBe(LEGACY_COLORS.red);
    expect(transactionColor("MARK_DEFECTIVE")).toBe(LEGACY_COLORS.red);
  });

  it("주의 거래 → yellow", () => {
    expect(transactionColor("ADJUST")).toBe(LEGACY_COLORS.yellow);
    expect(transactionColor("RESERVE")).toBe(LEGACY_COLORS.yellow);
  });

  it("BACKFLUSH 은 고유 색 #fb923c", () => {
    expect(transactionColor("BACKFLUSH")).toBe("#fb923c");
  });

  it("muted 거래 → muted/muted2", () => {
    expect(transactionColor("RESERVE_RELEASE")).toBe(LEGACY_COLORS.muted2);
    expect(transactionColor("DISASSEMBLE")).toBe(LEGACY_COLORS.muted);
    expect(transactionColor("RETURN")).toBe(LEGACY_COLORS.muted);
    expect(transactionColor("SUPPLIER_RETURN")).toBe(LEGACY_COLORS.muted);
  });

  it("unknown → muted2", () => {
    expect(transactionColor("UNKNOWN")).toBe(LEGACY_COLORS.muted2);
  });
});
