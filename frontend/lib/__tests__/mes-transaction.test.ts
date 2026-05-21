import { describe, it, expect } from "vitest";
import {
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
} from "../mes/transaction";

describe("mes/transaction barrel", () => {
  it("re-exports TRANSACTION_META with 11 keys", () => {
    const required = [
      "RECEIVE", "PRODUCE", "SHIP", "ADJUST", "BACKFLUSH",
      "DISASSEMBLE",
      "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT",
      "MARK_DEFECTIVE", "SUPPLIER_RETURN",
    ];
    expect(Object.keys(TRANSACTION_META).sort()).toEqual(required.sort());
  });

  it("getTransactionLabel returns Korean label for known type", () => {
    expect(getTransactionLabel("RECEIVE")).toBe("원자재 입고");
    expect(getTransactionLabel("MARK_DEFECTIVE")).toBe("불량");
    expect(getTransactionLabel("TRANSFER_DEPT")).toBe("부서이동");
  });

  it("getTransactionLabel returns input as-is for unknown type", () => {
    expect(getTransactionLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("getTransactionTone matches MesTone for each meta entry", () => {
    expect(getTransactionTone("RECEIVE")).toBe("success");
    expect(getTransactionTone("MARK_DEFECTIVE")).toBe("danger");
    expect(getTransactionTone("UNKNOWN")).toBe("info");
  });
});
