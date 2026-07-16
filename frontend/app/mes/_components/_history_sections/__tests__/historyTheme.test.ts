import { describe, expect, it } from "vitest";
import { PROCESS_TYPE_META } from "../historyTheme";

describe("PROCESS_TYPE_META", () => {
  it("uses the shared process colors for history labels", () => {
    expect(PROCESS_TYPE_META.PA).toMatchObject({
      color: "var(--c-process-pa)",
      bg: "color-mix(in srgb, var(--c-process-pa) 16%, transparent)",
    });
    expect(PROCESS_TYPE_META.PF).toMatchObject({
      color: "var(--c-process-pf)",
      bg: "color-mix(in srgb, var(--c-process-pf) 16%, transparent)",
    });
    expect(PROCESS_TYPE_META.AA).toMatchObject({ color: "var(--c-process-aa)" });
    expect(PROCESS_TYPE_META.AF).toMatchObject({ color: "var(--c-process-af)" });
  });
});
