import { describe, it, expect } from "vitest";
import { PROCESS_LABEL, processStageLabel } from "../mes/process";

describe("processStageLabel", () => {
  it("returns Korean label for known stage codes", () => {
    expect(processStageLabel("TR")).toBe("Tube Raw");
    expect(processStageLabel("AA")).toBe("Assembly");
    expect(processStageLabel("PF")).toBe("Pack Final");
  });

  it("returns input as-is for unknown code", () => {
    expect(processStageLabel("XX")).toBe("XX");
  });

  it("returns '-' for empty / null / undefined", () => {
    expect(processStageLabel(undefined)).toBe("-");
    expect(processStageLabel(null)).toBe("-");
    expect(processStageLabel("")).toBe("-");
  });
});

describe("PROCESS_LABEL", () => {
  it("covers 18 stages (6 부서 × 3 단계)", () => {
    expect(Object.keys(PROCESS_LABEL).length).toBe(18);
  });
});
