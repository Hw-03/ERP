import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, IoSubType, IoWorkType } from "@/lib/api";
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

function DepartmentSingleAdjustHarness({ initialNotes = "" }: { initialNotes?: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const adjustmentLine = {
    ...parentLine,
    direction: "adjust" as const,
    from_bucket: "production" as const,
    from_department: "조립",
    to_bucket: "none" as const,
    to_department: null,
    origin: "manual",
  };

  return (
    <IoConfirmStep
      workType="process"
      subType="adjust_out"
      bundles={[{ ...bundle, source_kind: "direct_item", lines: [adjustmentLine] }]}
      notes={notes}
      hasShortage={false}
      hasInvalidQuantity={false}
      submitting={false}
      saving={false}
      approvalKind="department"
      onNotesChange={setNotes}
      onSubmit={() => {}}
      onSaveDraft={vi.fn()}
    />
  );
}

describe("IoConfirmStep", () => {
  it("requires a non-blank memo before submitting a department single adjustment", () => {
    render(<DepartmentSingleAdjustHarness />);

    expect(screen.getByText("메모 (필수)")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("메모를 입력해야 부서 결재 요청을 할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "재고 실사 차이" } });

    expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeEnabled();
  });

  it("창고 보정 입고는 BOM 없이 즉시 반영 확인 문구를 사용한다", () => {
    const adjustmentLine = {
      ...parentLine,
      direction: "adjust" as const,
      from_bucket: "none" as const,
      to_bucket: "warehouse" as const,
      to_department: null,
    };
    render(
      <IoConfirmStep
        workType={"warehouse_adjust" as IoWorkType}
        subType={"warehouse_adjust_in" as IoSubType}
        bundles={[{ ...bundle, source_kind: "direct_item", lines: [adjustmentLine] }]}
        notes=""
        hasShortage={false}
        hasInvalidQuantity={false}
        submitting={false}
        saving={false}
        approvalKind="none"
        onNotesChange={() => {}}
        onSubmit={() => {}}
        onSaveDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("보정 입고 · 반영 1건")).toBeInTheDocument();
    expect(screen.queryByText(/BOM/)).not.toBeInTheDocument();
    expect(screen.getByText("즉시 재고 반영")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "즉시 반영하기 1건" }));
    expect(screen.getByText("창고 보정 입고를 진행하시겠습니까?")).toBeInTheDocument();
  });

  it("internal use는 창고 결재·사용출고 확인 문구를 사용한다", () => {
    render(
      <IoConfirmStep
        workType="internal_use"
        subType="internal_use_out"
        bundles={[{ ...bundle, source_kind: "direct_item", lines: [parentLine] }]}
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

    expect(screen.getByText(/AS·연구 사용출고 · 반영 1건/)).toBeInTheDocument();
    expect(screen.getByText("창고 결재 요청")).toBeInTheDocument();
    expect(screen.getByText("창고 결재 필요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "창고 결재 요청 1건" }));
    expect(screen.getByText("AS·연구 사용출고를 요청하시겠습니까?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결재 요청" })).toBeInTheDocument();
  });

  it("uses a full-width row button to expand confirmation bundles", () => {
    renderConfirmStep();

    const rowButton = screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ });
    expect(rowButton.tagName).toBe("ARTICLE");
    expect(rowButton).not.toHaveClass("border-2");
    expect(rowButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("ADX6000 BODY RIGHT ASSY")).not.toBeInTheDocument();

    fireEvent.click(rowButton);

    expect(rowButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("ADX6000 BODY RIGHT ASSY")).toBeInTheDocument();
  });

  it("aligns the save action with the Step 4 mobile action button rhythm", () => {
    renderConfirmStep();

    expect(screen.getByRole("button", { name: "저장" })).toHaveClass("gap-1.5");
  });
});
