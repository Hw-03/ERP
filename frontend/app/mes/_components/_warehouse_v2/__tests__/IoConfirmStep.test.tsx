import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function MixedProcessMemoHarness({ subType }: { subType: "produce" | "disassemble" }) {
  const [notes, setNotes] = useState("");
  const manualLine = {
    ...parentLine,
    line_id: "manual-line",
    item_id: "manual-item",
    origin: "manual" as const,
    direction: "adjust" as const,
    from_bucket: subType === "produce" ? "none" as const : "production" as const,
    from_department: subType === "produce" ? null : "조립",
    to_bucket: subType === "produce" ? "production" as const : "none" as const,
    to_department: subType === "produce" ? "조립" : null,
  };

  return (
    <IoConfirmStep
      workType="process"
      subType={subType}
      bundles={[bundle, { ...bundle, bundle_id: "manual-bundle", source_kind: "manual", lines: [manualLine] }]}
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
  it("커스텀 출고 BOM의 원본 회수 라인을 선택 출고 음수로 표시한다", () => {
    const customChild = {
      ...childLine,
      direction: "in" as const,
      from_bucket: "none" as const,
      from_department: null,
      to_bucket: "production" as const,
      to_department: "조립",
      quantity: 2,
      bom_expected: 1,
      edited: true,
    };
    render(
      <IoConfirmStep
        workType="process"
        subType="disassemble"
        bundles={[{ ...bundle, quantity: 1, lines: [parentLine, customChild] }]}
        notes=""
        hasShortage={false}
        hasInvalidQuantity={false}
        submitting={false}
        saving={false}
        approvalKind="department"
        onNotesChange={() => {}}
        onSubmit={() => {}}
        onSaveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ }));
    expect(screen.getByText("-2")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("커스텀 부서 BOM은 상위를 제외한 하위 품목 수로 결재를 안내한다", () => {
    const customChild = {
      ...childLine,
      direction: "out" as const,
      from_bucket: "production" as const,
      from_department: "조립",
      to_bucket: "none" as const,
      to_department: null,
      quantity: 2,
      bom_expected: 1,
      edited: true,
    };
    render(
      <IoConfirmStep
        workType="process"
        subType="produce"
        bundles={[{ ...bundle, lines: [parentLine, customChild] }]}
        notes=""
        hasShortage={false}
        hasInvalidQuantity={false}
        submitting={false}
        saving={false}
        approvalKind="department"
        onNotesChange={() => {}}
        onSubmit={() => {}}
        onSaveDraft={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeEnabled();
    const card = screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ });
    expect(within(card).getByText(/상위 변동 없음 · 하위 1/)).toBeInTheDocument();
    expect(within(card).queryByText("-1")).not.toBeInTheDocument();
  });

  it("커스텀 분해 BOM은 최종 확인에서도 참고 출고와 상위 미반영을 안내한다", () => {
    render(
      <IoConfirmStep
        workType="process"
        subType="disassemble"
        bundles={[{ ...bundle, lines: [parentLine, { ...childLine, quantity: 2 }] }]}
        notes=""
        hasShortage={false}
        hasInvalidQuantity={false}
        submitting={false}
        saving={false}
        approvalKind="department"
        onNotesChange={() => {}}
        onSubmit={() => {}}
        onSaveDraft={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ });
    expect(within(card).getByText(/BOM 참고 출고 · 상위 미반영 · 하위 1/)).toBeInTheDocument();
  });

  it("빈 메모 안내를 입력칸 안에 표시하고 제출은 차단한다", () => {
    render(<DepartmentSingleAdjustHarness />);

    expect(screen.getByText("메모 (필수)")).toBeInTheDocument();
    const memoInput = screen.getByRole("textbox");
    expect(memoInput).toHaveAttribute("aria-required", "true");
    expect(memoInput).toHaveAttribute("placeholder", "메모를 입력해야 부서 결재 요청을 할 수 있습니다.");
    expect(screen.queryByText("메모를 입력해야 부서 결재 요청을 할 수 있습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();

    fireEvent.change(memoInput, { target: { value: "재고 실사 차이" } });

    expect(memoInput).toHaveAttribute("placeholder", "작업 메모");
    expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeEnabled();
  });

  it.each(["produce", "disassemble"] as const)("혼합 %s 작업은 낱개가 있으면 메모 없이 제출할 수 없다", (subType) => {
    render(<MixedProcessMemoHarness subType={subType} />);

    expect(screen.getByText("메모 (필수)")).toBeInTheDocument();
    const memoInput = screen.getByRole("textbox");
    expect(screen.getByRole("button", { name: /부서 결재 요청 3건/ })).toBeDisabled();

    fireEvent.change(memoInput, { target: { value: "낱개 처리 사유" } });

    expect(screen.getByRole("button", { name: /부서 결재 요청 3건/ })).toBeEnabled();
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
    const sourceBadge = screen.getByLabelText("차감 위치: 창고");
    expect(sourceBadge).toHaveClass("min-w-[112px]", "flex-col", "gap-0.5");
    expect(sourceBadge.parentElement).toContainElement(screen.getByText("-1"));
  });

  it("internal use가 창고와 부서 위치를 함께 쓰면 위치별 결재 문구를 사용한다", () => {
    const warehouseLine = {
      ...parentLine,
      to_bucket: "none" as const,
      to_department: "AS",
    };
    const departmentLine = {
      ...parentLine,
      line_id: "department-line",
      item_id: "department-item",
      item_name: "부서 재고 품목",
      from_bucket: "production" as const,
      from_department: "튜브",
      to_bucket: "none" as const,
      to_department: "AS",
    };

    render(
      <IoConfirmStep
        workType="internal_use"
        subType="internal_use_out"
        bundles={[{ ...bundle, source_kind: "direct_item", lines: [warehouseLine, departmentLine] }]}
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

    expect(screen.getAllByText("위치별 결재 요청")).toHaveLength(2);
    expect(screen.getByText("위치별 결재 필요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "위치별 결재 요청" })).toBeInTheDocument();
    expect(screen.queryByText(/원본별 결재/)).not.toBeInTheDocument();
  });

  it("internal-use BOM 자식마다 실제 부서 차감 위치를 표시한다", () => {
    const highVoltageChild = {
      ...childLine,
      line_id: "high-voltage-child",
      from_bucket: "production" as const,
      from_department: "고압",
      to_bucket: "none" as const,
      to_department: "연구",
    };
    const tubeChild = {
      ...childLine,
      line_id: "tube-child",
      item_id: "tube-child-item",
      item_name: "튜브 구성품",
      from_bucket: "production" as const,
      from_department: "튜브",
      to_bucket: "none" as const,
      to_department: "연구",
    };
    render(
      <IoConfirmStep
        workType="internal_use"
        subType="internal_use_out"
        bundles={[{ ...bundle, lines: [highVoltageChild, tubeChild] }]}
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

    fireEvent.click(screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ }));

    expect(screen.getByLabelText("차감 위치: 고압")).toHaveClass("flex-col", "gap-0.5");
    expect(screen.getByLabelText("차감 위치: 튜브")).toHaveClass("flex-col", "gap-0.5");
  });

  it("internal-use BOM 최종 확인에 차감 방식과 출고·재입고·변동 없음을 모두 표시한다", () => {
    const outbound = {
      ...childLine,
      selected: true,
      direction: "out" as const,
      from_bucket: "warehouse" as const,
      from_department: null,
      to_bucket: "none" as const,
      to_department: "연구",
    };
    const returned = {
      ...childLine,
      line_id: "returned-child",
      item_id: "returned-item",
      item_name: "재입고 하위품",
      selected: false,
      direction: "in" as const,
      from_bucket: "none" as const,
      from_department: null,
      to_bucket: "production" as const,
      to_department: "고압",
      included: true,
      exclusion_note: "소속 부서 재입고",
    };
    const unchanged = {
      ...childLine,
      line_id: "unchanged-child",
      item_id: "unchanged-item",
      item_name: "변동 없는 하위품",
      selected: false,
      direction: "out" as const,
      from_bucket: "warehouse" as const,
      from_department: null,
      to_bucket: "none" as const,
      to_department: "연구",
      included: false,
      exclusion_note: "변동 없음",
    };
    const childrenOnlyOutbound = {
      ...outbound,
      line_id: "children-only-outbound",
      item_id: "children-only-outbound-item",
      item_name: "하위만 출고품",
    };

    render(
      <IoConfirmStep
        workType="internal_use"
        subType="internal_use_out"
        bundles={[
          {
            ...bundle,
            internal_use_bom_mode: "parent_and_children",
            source_location: "warehouse",
            lines: [parentLine, outbound, returned],
          },
          {
            ...bundle,
            bundle_id: "children-only-bundle",
            title: "하위만 묶음",
            internal_use_bom_mode: "children_only",
            source_location: "warehouse",
            lines: [childrenOnlyOutbound, unchanged],
          },
        ]}
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

    expect(screen.getByText("상·하위 차감")).toBeInTheDocument();
    expect(screen.getByText("하위만 차감")).toBeInTheDocument();
    const childrenOnlyBundle = screen.getByRole("button", { name: /하위만 묶음/ });
    expect(within(childrenOnlyBundle).queryByText("-1")).not.toBeInTheDocument();
    expect(within(childrenOnlyBundle).getByText(/상위 변동 없음/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ }));
    fireEvent.click(childrenOnlyBundle);
    expect(screen.getAllByText("출고")).toHaveLength(2);
    expect(screen.getByText("소속 부서 재입고")).toBeInTheDocument();
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
    expect(screen.getAllByText("위치별 결재 요청")).toHaveLength(2);
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

  it("최종 확인 목록을 요약 카드의 좌우 기준선과 같은 품목 표면으로 맞춘다", () => {
    const directLine = {
      ...parentLine,
      line_id: "direct-line",
      item_id: "direct-item",
      item_name: "직접 선택 품목",
    };
    render(
      <IoConfirmStep
        workType="warehouse_io"
        subType="warehouse_to_dept"
        bundles={[
          bundle,
          {
            ...bundle,
            bundle_id: "direct-bundle",
            source_kind: "direct_item",
            title: directLine.item_name,
            source_item_id: directLine.item_id,
            lines: [directLine],
          },
        ]}
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

    const bundleRow = screen.getByRole("button", { name: /히팅 싱크 \+ 방열팬/ });
    const directName = screen.getByText("직접 선택 품목");
    const directRow = directName.parentElement?.parentElement;

    expect(bundleRow.parentElement).not.toHaveClass("pr-1");
    expect(bundleRow).toHaveClass("px-5", "py-4");
    expect(directRow).toHaveClass("rounded-[18px]", "px-5", "py-3");
    expect(directRow?.style.background).toBe(bundleRow.style.background);
  });

  it("aligns the save action with the Step 4 mobile action button rhythm", () => {
    renderConfirmStep();

    expect(screen.getByRole("button", { name: "저장" })).toHaveClass("gap-1.5");
  });
});
