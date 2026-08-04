import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeeklyProductionMatrix } from "../WeeklyProductionMatrix";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => (name: string) => (name === "조립" ? "#123456" : "#475569"),
}));

describe("WeeklyProductionMatrix", () => {
  it("uses the shared department display color for the assembly matrix column", () => {
    render(
      <WeeklyProductionMatrix
        rows={[
          {
            model_key: "DX3000",
            model_label: "DX3000",
            tf_qty: 0,
            hf_qty: 0,
            vf_qty: 0,
            nf_qty: 0,
            af_qty: 8,
            pf_qty: 0,
            total_qty: 8,
          },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "조립" }).getAttribute("style")).toContain("#123456");
  });
});
