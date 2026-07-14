import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { ReworkBatchDetail } from "../ReworkBatchDetail";
import { ReworkBatchHeader } from "../ReworkBatchHeader";
import type { LogGroup } from "../historyTableHelpers";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "3-AA-0018",
    item_name: "재작업 품목",
    item_process_type_code: "AA",
    item_unit: "EA",
    transaction_type: "DEFECT_SCRAP",
    quantity_change: -5,
    quantity_before: 10,
    quantity_after: 5,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 5,
    reference_no: "defect-disassemble:parent",
    produced_by: null,
    requester_name: "작업자",
    approver_name: "승인자",
    requested_at: "2026-07-10T00:00:00Z",
    approved_at: "2026-07-10T00:00:00Z",
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-10T00:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    ...overrides,
  };
}

function makeGroup(): Extract<LogGroup, { type: "batch" }> {
  return {
    type: "batch",
    refKey: "defect-disassemble:parent::",
    refNo: "defect-disassemble:parent",
    logs: [
      makeLog({
        log_id: "parent",
        item_id: "PARENT",
        item_name: "재작업 모품목",
        transaction_type: "DISASSEMBLE",
      }),
      makeLog({ log_id: "child" }),
    ],
  };
}

function renderHeader({
  compact = false,
  selected = false,
  onSelect = vi.fn(),
  onToggle = vi.fn(),
}: {
  compact?: boolean;
  selected?: boolean;
  onSelect?: ReturnType<typeof vi.fn>;
  onToggle?: ReturnType<typeof vi.fn>;
} = {}) {
  render(
    <table>
      <tbody>
        <ReworkBatchHeader
          group={makeGroup()}
          expanded={false}
          onToggle={onToggle}
          selected={selected}
          onSelect={onSelect}
          compact={compact}
          controlsId="rework-detail"
        />
      </tbody>
    </table>,
  );
}

function setBoxMetrics(
  element: HTMLElement,
  metrics: { clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number },
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
  fireEvent(window, new Event("resize"));
}

describe("ReworkBatchHeader", () => {
  it("keeps the rework color when selected", () => {
    renderHeader({ selected: true });

    const row = screen.getByRole("button", { name: "묶음 펼치기" }).closest("tr")!;
    expect(row).toHaveStyle({
      background: tint(LEGACY_COLORS.red, 12),
      outline: `1.5px solid ${LEGACY_COLORS.red}`,
    });
    fireEvent.mouseEnter(row);
    expect(row).toHaveStyle({ background: tint(LEGACY_COLORS.red, 18) });
  });

  it("keeps the operation badge width when the table is constrained", () => {
    renderHeader({ compact: true });

    const toggle = screen.getByRole("button", { name: "묶음 펼치기" });
    const row = toggle.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    const quantityPill = screen.getByText("재작업 5 EA");

    expect(cells[1].firstElementChild).toHaveClass("px-3");
    expect(cells[2]).toHaveClass("px-2");
    expect(cells[4]).toHaveClass("px-2");
    expect(cells[5]).toHaveClass("px-2");
    expect(cells[6]).toHaveClass("px-2");
    expect(quantityPill).toHaveClass("min-w-[12.75rem]");
    expect(quantityPill).not.toHaveClass("min-w-0", "flex-1");
  });

  it.each(["Enter", " "])("keeps row selection separate from chevron toggle with %s", (key) => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    renderHeader({ onSelect, onToggle });

    const toggle = screen.getByRole("button", { name: "묶음 펼치기" });
    const row = toggle.closest("tr")!;

    expect(row).not.toHaveAttribute("role");
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(row).not.toHaveAttribute("aria-pressed");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveClass("focus-visible:outline");
    expect(toggle).toHaveClass("focus-visible:outline");
    expect(toggle).toHaveAttribute("aria-controls", "rework-detail");

    fireEvent.keyDown(row, { key });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();

    onSelect.mockClear();
    fireEvent.keyDown(toggle, { key });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ReworkBatchDetail", () => {
  it("constrains the compact result badge while preserving its full label", () => {
    render(
      <table>
        <tbody>
          <ReworkBatchDetail
            logs={[makeLog()]}
            parentItemId="PARENT"
            colSpan={8}
            compact
          />
        </tbody>
      </table>,
    );

    const cell = screen.getByText("처리결과").closest("td")!;
    const badge = cell.querySelector("span.inline-flex")!;
    const visibleLabel = badge.querySelector("span");

    expect(badge).toHaveClass("w-full", "max-w-full", "min-w-0", "px-2");
    expect(badge).not.toHaveClass("min-w-[6.5rem]");
    expect(badge).toHaveAttribute("title", "처리결과");
    expect(badge).toHaveAttribute("aria-label", "처리결과");
    expect(visibleLabel).toHaveClass("min-w-0", "truncate");
  });

  it("keeps the noncompact result badge unchanged", () => {
    render(
      <table>
        <tbody>
          <ReworkBatchDetail
            logs={[makeLog()]}
            parentItemId="PARENT"
            colSpan={8}
          />
        </tbody>
      </table>,
    );

    const badge = screen.getByText("처리결과");
    expect(badge).toHaveClass("min-w-[6.5rem]", "px-3");
    expect(badge).not.toHaveClass("w-full", "min-w-0");
    expect(badge).not.toHaveAttribute("title");
    expect(badge).not.toHaveAttribute("aria-label");
  });

  it("shows the full overflowing item name on hover and focus", async () => {
    const longName = "공백없이매우긴재작업구성품이름".repeat(8);
    render(
      <table>
        <tbody>
          <ReworkBatchDetail
            logs={[makeLog({ item_name: longName })]}
            parentItemId="PARENT"
            colSpan={8}
            compact
            controlsId="rework-detail"
          />
        </tbody>
      </table>,
    );

    const text = screen.getByText(longName);
    expect(text.closest("tr")).toHaveAttribute("id", "rework-detail");
    setBoxMetrics(text, { clientWidth: 100, scrollWidth: 320, clientHeight: 20, scrollHeight: 20 });
    const trigger = text.parentElement!;
    await waitFor(() => expect(trigger).toHaveAttribute("tabindex", "0"));

    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName);
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName);
  });

  it("does not add a tooltip when the item name fits", () => {
    render(
      <table>
        <tbody>
          <ReworkBatchDetail
            logs={[makeLog({ item_name: "짧은 품목명" })]}
            parentItemId="PARENT"
            colSpan={8}
          />
        </tbody>
      </table>,
    );

    const text = screen.getByText("짧은 품목명");
    setBoxMetrics(text, { clientWidth: 120, scrollWidth: 120, clientHeight: 20, scrollHeight: 20 });
    const trigger = text.parentElement!;
    expect(trigger).not.toHaveAttribute("tabindex");

    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
