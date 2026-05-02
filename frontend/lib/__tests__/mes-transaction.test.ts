import { describe, it, expect } from "vitest";
import {
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
} from "../mes/transaction";

describe("mes/transaction barrel", () => {
  it("re-exports TRANSACTION_META with 16 keys", () => {
    const required = [
      "RECEIVE", "PRODUCE", "SHIP", "ADJUST", "BACKFLUSH",
      "SCRAP", "LOSS", "DISASSEMBLE", "RETURN",
      "RESERVE", "RESERVE_RELEASE",
      "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT",
      "MARK_DEFECTIVE", "SUPPLIER_RETURN",
    ];
    expect(Object.keys(TRANSACTION_META).sort()).toEqual(required.sort());
  });

  it("getTransactionLabel returns Korean label for known type", () => {
    expect(getTransactionLabel("RECEIVE")).toBe("입고");
    expect(getTransactionLabel("SCRAP")).toBe("폐기");
    expect(getTransactionLabel("TRANSFER_DEPT")).toBe("부서이동");
  });

  it("getTransactionLabel returns input as-is for unknown type", () => {
    expect(getTransactionLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("getTransactionTone matches MesTone for each meta entry", () => {
    expect(getTransactionTone("RECEIVE")).toBe("success");
    expect(getTransactionTone("SCRAP")).toBe("danger");
    expect(getTransactionTone("UNKNOWN")).toBe("info");
  });
});
