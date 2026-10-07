import { describe, expect, it } from "vitest";
import { hasDefectReason } from "../defectCartValidation";

describe("required defect category", () => {
  it("requires a category even with a memo", () => {
    expect(hasDefectReason("", "메모만 입력")).toBe(false);
  });
  it("requires a memo for other", () => {
    expect(hasDefectReason("기타", " ")).toBe(false);
    expect(hasDefectReason("기타", "원인 조사 중")).toBe(true);
  });
  it("accepts a named reason without a memo", () => {
    expect(hasDefectReason("외관 불량", "")).toBe(true);
  });
});
