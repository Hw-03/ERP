import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api";
import { IoDraftWorkTable } from "../IoDraftWorkTable";

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "line-1",
    item_id: "item-1",
    item_name: "DX3000 분해 대상",
    mes_code: "3-AA-0001",
    unit: "EA",
    direction: "out",
    from_bucket: "production",
    from_department: "조립",
    to_bucket: "none",
    to_department: null,
    quantity: 1,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<IoBundle> = {}): IoBundle {
  return {
    bundle_id: "bundle-1",
    source_kind: "bom_parent",
    title: "DX3000 분해 대상",
    source_item_id: "item-1",
    source_mes_code: "3-AA-0001",
    quantity: 1,
    expanded_level: 1,
    lines: [
      makeLine(),
      makeLine({
        line_id: "line-2",
        item_id: "item-2",
        item_name: "DX3000 POWER BUTTON",
        mes_code: "3-AR-0006",
        direction: "in",
        from_bucket: "none",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
        quantity: 2,
        bom_expected: 2,
        origin: "bom_auto",
      }),
    ],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<IoBatch> = {}): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "disassemble",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: null,
    to_department: "조립",
    requires_approval: true,
    stock_request_id: null,
    shipping_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-08-04T00:05:00Z",
    updated_at: "2026-08-04T00:10:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [makeBundle()],
    ...overrides,
  };
}

describe("IoDraftWorkTable hierarchy", () => {
  it("shows a collapsed inventory-change summary and reveals the BOM rows on demand", () => {
    render(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    for (const label of ["상세", "작업 시작", "작업", "대상", "품목코드", "수량", "예정 변동"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    const startedAt = screen.getByText("08/04 09:05");
    const toggle = screen.getByRole("button", { name: "작업 상세 펼치기" });
    expect(startedAt).toHaveClass("whitespace-nowrap");
    expect(startedAt.closest("td")).not.toBe(toggle.closest("td"));
    expect(screen.queryByText("출고 · BOM")).not.toBeInTheDocument();
    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.getByText("증가 1종")).toBeInTheDocument();
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("분해 대상")).toBeInTheDocument();
    expect(screen.getByText("DX3000 POWER BUTTON")).toBeInTheDocument();
    expect(screen.getByText("회수 품목")).toBeInTheDocument();
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
  });

  it("shows a custom disassemble BOM as parent unchanged and selected children outbound", () => {
    const draft = makeDraft({
      bundles: [makeBundle({
        title: "SOLO 18cm CONE ASS'Y",
        lines: [
          makeLine({ item_name: "SOLO 18cm CONE ASS'Y" }),
          makeLine({
            line_id: "line-excluded-child",
            item_id: "item-excluded-child",
            item_name: "SOLO 연장 CONE",
            mes_code: "8-AR-0272",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            quantity: 0,
            bom_expected: 1,
            included: false,
            edited: true,
            origin: "bom_auto",
          }),
          makeLine({
            line_id: "line-selected-child",
            item_id: "item-selected-child",
            item_name: "SOLO MAIN CONE",
            mes_code: "8-AR-0273",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            quantity: 1,
            bom_expected: 1,
            origin: "bom_auto",
          }),
        ],
      })],
    });

    render(
      <IoDraftWorkTable
        drafts={[draft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.queryByText(/증가 \d+종/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "작업 상세 펼치기" }));
    const parentRow = screen.getAllByText("SOLO 18cm CONE ASS'Y").at(-1)?.closest("tr");
    const selectedChildRow = screen.getByText("SOLO MAIN CONE").closest("tr");
    expect(parentRow).toHaveTextContent("상위 미반영");
    expect(parentRow).toHaveTextContent("변동 없음");
    expect(selectedChildRow).toHaveTextContent("선택 출고");
    expect(selectedChildRow).toHaveTextContent("−1 EA");
  });

  it("opens only one draft at a time with keyboard row controls", () => {
    const secondDraft = makeDraft({
      batch_id: "batch-2",
      bundles: [makeBundle({
        bundle_id: "bundle-2",
        title: "DX4000 분해 대상",
        source_item_id: "item-3",
        source_mes_code: "3-AA-4000",
        lines: [
          makeLine({ line_id: "line-3", item_id: "item-3", item_name: "DX4000 분해 대상", mes_code: "3-AA-4000" }),
          makeLine({
            line_id: "line-4",
            item_id: "item-4",
            item_name: "DX4000 회수품",
            mes_code: "3-AR-4000",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            origin: "bom_auto",
          }),
        ],
      })],
    });
    render(
      <IoDraftWorkTable
        drafts={[makeDraft(), secondDraft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const firstRow = screen.getByText("DX3000 분해 대상").closest("tr")!;
    const secondRow = screen.getByText("DX4000 분해 대상").closest("tr")!;
    expect(firstRow).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(firstRow, { key: "Enter" });
    expect(screen.getByText("DX3000 POWER BUTTON")).toBeInTheDocument();

    fireEvent.keyDown(secondRow, { key: " " });
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();
    expect(screen.getByText("DX4000 회수품")).toBeInTheDocument();
  });

  it("keeps row expansion separate from continue and delete actions", () => {
    const onContinue = vi.fn();
    const onRequestDelete = vi.fn();
    const { rerender } = render(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId={null}
        onContinue={onContinue}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onRequestDelete).toHaveBeenCalledOnce();
    expect(screen.queryByText("DX3000 POWER BUTTON")).not.toBeInTheDocument();

    rerender(
      <IoDraftWorkTable
        drafts={[makeDraft()]}
        busyId="batch-1"
        onContinue={onContinue}
        onRequestDelete={onRequestDelete}
      />,
    );
    expect(screen.getByRole("button", { name: "이어서 작업" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "작업 삭제" })).toBeDisabled();
  });

  it("excludes non-effective lines from the summary and labels move and shortage states", () => {
    const draft = makeDraft({
      sub_type: "warehouse_to_dept",
      bundles: [makeBundle({
        lines: [
          makeLine({ shortage: 1 }),
          makeLine({
            line_id: "line-move",
            item_id: "item-move",
            item_name: "이동 품목",
            direction: "move",
            from_bucket: "warehouse",
            to_bucket: "production",
            to_department: "조립",
            origin: "bom_auto",
            quantity: 3,
          }),
          makeLine({
            line_id: "line-excluded",
            item_id: "item-excluded",
            item_name: "제외 품목",
            direction: "in",
            from_bucket: "none",
            to_bucket: "production",
            included: false,
            origin: "bom_auto",
            quantity: 4,
          }),
        ],
      })],
    });
    render(
      <IoDraftWorkTable
        drafts={[draft]}
        busyId={null}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("감소 1종")).toBeInTheDocument();
    expect(screen.getByText("이동 1종")).toBeInTheDocument();
    expect(screen.queryByText(/증가 \d+종/)).not.toBeInTheDocument();
    expect(screen.getByText("부족 1종")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "작업 상세 펼치기" }));
    expect(screen.getByText("3 EA 이동")).toBeInTheDocument();
    expect(screen.getByText("제외 품목")).toHaveStyle({ textDecoration: "line-through" });
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
  });
});
