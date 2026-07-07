import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle } from "@/lib/api";
import { IoConfirmStep } from "../IoConfirmStep";

const parentLine = {
  line_id: "parent-line",
  item_id: "parent-item",
  item_name: "히팅 싱크 + 방열팬 (구형)",
  mes_code: "46-AA-0080",
  unit: "EA",
  direction: "out",
  from_bucket: "warehouse",
  from_department: null,
  to_bucket: "production",
  to_department: "조립",
  quantity: 1,
  bom_expected: null,
  included: true,
  origin: "direct",
  edited: false,
  has_children: false,
  shortage: 0,
  exclusion_note: null,
} satisfies IoBundle["lines"][number];

const childLine = {
  ...parentLine,
  line_id: "child-line",
  item_id: "child-item",
  item_name: "ADX6000 BODY RIGHT ASSY",
  mes_code: "6-AA-0037",
  origin: "bom_auto",
  bom_expected: 1,
} satisfies IoBundle["lines"][number];

const bundle = {
  bundle_id: "bundle-1",
  source_kind: "bom_parent",
  title: "히팅 싱크 + 방열팬 (구형)",
  source_item_id: "parent-item",
  source_mes_code: "46-AA-0080",
  quantity: 1,
  expanded_level: 1,
  lines: [parentLine, childLine],
} satisfies IoBundle;

function renderConfirmStep() {
  return render(
    <IoConfirmStep
      workType="warehouse_io"
      subType="warehouse_to_dept"
      bundles={[bundle]}
      notes=""
      hasShortage={false}
      hasInvalidQuantity={false}
      submitting={false}
      saving={false}
      approvalKind="warehouse"
      onNotesChange={() => {}}
      onSubmit={() => {}}
      onSaveDraft={vi.fn()}
    />,
  );
}

describe("IoConfirmStep", () => {
  it("uses a full-width row button to expand confirmation bundles", () => {
    renderConfirmStep();

    const rowButton = screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ });
    expect(rowButton).toHaveClass("w-full");
    expect(rowButton.closest("article")).not.toHaveClass("border-2");
    expect(screen.queryByText("ADX6000 BODY RIGHT ASSY")).not.toBeInTheDocument();

    fireEvent.click(rowButton);

    expect(screen.getByText("ADX6000 BODY RIGHT ASSY")).toBeInTheDocument();
  });

  it("aligns the save action with the Step 4 mobile action button rhythm", () => {
    renderConfirmStep();

    expect(screen.getByRole("button", { name: "저장" })).toHaveClass("gap-1.5");
  });
});
