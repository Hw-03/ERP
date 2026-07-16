import { describe, it, expect } from "vitest";
import {
  PROCESS_LABEL,
  PROCESS_TYPE_COLORS,
  PROCESS_TO_DEPT,
  processStageLabel,
  processTypeColor,
  mesCodeDept,
  mesCodeDeptBadge,
  displayPart,
} from "../mes/process";

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

describe("mesCodeDept", () => {
  it("maps stage code 첫 글자 → 부서", () => {
    expect(mesCodeDept("ITM-TR-00001")).toBe("튜브");
    expect(mesCodeDept("ITM-HA-00010")).toBe("고압");
    expect(mesCodeDept("ITM-VF-00099")).toBe("진공");
    expect(mesCodeDept("ITM-NR-00001")).toBe("튜닝");
    expect(mesCodeDept("ITM-AA-00001")).toBe("조립");
    expect(mesCodeDept("ITM-PF-00001")).toBe("출하");
  });

  it("returns null for missing/short/unknown code", () => {
    expect(mesCodeDept(undefined)).toBeNull();
    expect(mesCodeDept(null)).toBeNull();
    expect(mesCodeDept("")).toBeNull();
    expect(mesCodeDept("ONLYONE")).toBeNull();
    expect(mesCodeDept("ITM-XX-00001")).toBeNull();
  });
});

describe("PROCESS_TO_DEPT", () => {
  it("covers 18 stage codes mapping to 6 부서", () => {
    expect(Object.keys(PROCESS_TO_DEPT).length).toBe(18);
    expect(new Set(Object.values(PROCESS_TO_DEPT)).size).toBe(6);
  });
});

describe("processTypeColor", () => {
  it("returns the approved token for every process code", () => {
    expect(Object.keys(PROCESS_TYPE_COLORS)).toHaveLength(18);
    expect(processTypeColor("PR")).toBe("var(--c-process-pr)");
    expect(processTypeColor("PA")).toBe("var(--c-process-pa)");
    expect(processTypeColor("PF")).toBe("var(--c-process-pf)");
    expect(processTypeColor("AR")).toBe("var(--c-process-ar)");
    expect(processTypeColor("AA")).toBe("var(--c-process-aa)");
    expect(processTypeColor("AF")).toBe("var(--c-process-af)");
  });

  it("uses the neutral token for unknown or missing codes", () => {
    expect(processTypeColor("XX")).toBe("var(--c-muted2)");
    expect(processTypeColor()).toBe("var(--c-muted2)");
  });
});

describe("displayPart", () => {
  it("returns label for known parts", () => {
    expect(displayPart("자재창고")).toBe("자재창고");
    expect(displayPart("조립출하")).toBe("조립출하");
    expect(displayPart("고압파트")).toBe("고압파트");
  });

  it("returns input as-is for unknown value", () => {
    expect(displayPart("XXX")).toBe("XXX");
  });

  it("returns '-' for empty / null / undefined", () => {
    expect(displayPart(undefined)).toBe("-");
    expect(displayPart(null)).toBe("-");
    expect(displayPart("")).toBe("-");
  });
});

describe("mesCodeDeptBadge", () => {
  const stub = (name?: string | null) => `#${name ?? "x"}`;

  it("returns label / color / bg for valid code", () => {
    const badge = mesCodeDeptBadge("ITM-AA-00001", stub);
    expect(badge).not.toBeNull();
    expect(badge!.label).toBe("조립");
    expect(badge!.color).toBe("#조립");
    expect(badge!.bg).toContain("color-mix");
    expect(badge!.bg).toContain("#조립");
  });

  it("returns null when item code does not map", () => {
    expect(mesCodeDeptBadge(undefined, stub)).toBeNull();
    expect(mesCodeDeptBadge("BAD", stub)).toBeNull();
    expect(mesCodeDeptBadge("ITM-XX-00001", stub)).toBeNull();
  });
});
