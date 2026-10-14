import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StocktakeTarget } from "@/lib/api/types/stocktake";
import { StocktakeTargetList } from "./StocktakeTargetList";

const target: StocktakeTarget = {
  target_id: "target-a", item_id: "item-a", scope_id: "warehouse", scope_name: "창고",
  item_code: "M-A", item_name: "시험 품목", unit: "개", target_version: 1,
  status: "CONFIRMED", version: 2, fence: 1, confirmation_revision_id: "revision-a",
};

describe("StocktakeTargetList selection", () => {
  it("keeps the desktop selection slot mounted across both directions without exposing hidden controls", () => {
    const props = { variant: "desktop" as const, rows: [target], loading: false, selection: {}, selectionTotal: 1, busy: false,
      hasNextPage: false, fetchingNextPage: false, filtered: false, imageManifest: {}, onSelect: vi.fn(), onToggle: vi.fn(), onToggleAll: vi.fn(), onMore: vi.fn(), onReset: vi.fn() };
    const { rerender } = render(<StocktakeTargetList {...props} waiting={false} />);
    const table = screen.getByRole("table");
    const slot = table.querySelector('thead th[aria-hidden="true"]');
    expect(slot).not.toBeNull();
    expect(slot).toHaveStyle({ width: "0px" });
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    rerender(<StocktakeTargetList {...props} waiting />);
    expect(screen.getByRole("table")).toBe(table);
    expect(screen.getByRole("columnheader", { name: /전체/ })).toBe(slot);
    expect(slot).toHaveStyle({ width: "80px" });
    fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
    expect(props.onToggleAll).toHaveBeenCalledWith(true);
    rerender(<StocktakeTargetList {...props} waiting={false} />);
    expect(table.querySelector('thead th[aria-hidden="true"]')).toBe(slot);
    expect(slot).toHaveStyle({ width: "0px" });
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(table).getByRole("checkbox", { name: "전체 선택", hidden: true })).toBeDisabled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it.each(["desktop", "mobile"] as const)("%s 일부 위치만 완료한 품목은 선택과 호버 후에도 계수 중 색을 유지한다", variant => {
    const completed = { ...target, status: "APPLIED" as const };
    const pending = { ...target, target_id: "target-b", status: "UNCOUNTED" as const };
    render(<StocktakeTargetList variant={variant} rows={[{ ...completed, location_targets: [completed, pending] }]}
      waiting={false} loading={false} selectedTargetId={completed.target_id} selection={{}} busy={false}
      hasNextPage={false} fetchingNextPage={false} filtered={false} imageManifest={{}}
      onSelect={vi.fn()} onToggle={vi.fn()} onMore={vi.fn()} onReset={vi.fn()} />);
    const row = screen.getByRole("button", { name: /계수 중/ });
    expect(row.style.background).toContain("var(--c-blue)");
    fireEvent.mouseEnter(row);
    expect(row.style.background).toContain("var(--c-blue)");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row.style.boxShadow).toContain("inset 3px");
  });

  it.each([
    ["desktop", "APPLIED", "완료", "green"], ["mobile", "APPLIED", "완료", "green"],
    ["desktop", "CONFIRMED", "대기", "yellow"], ["mobile", "CONFIRMED", "대기", "yellow"],
  ] as const)("%s %s 품목은 선택과 호버 후에도 상태 색을 유지한다", (variant, status, label, tone) => {
    render(<StocktakeTargetList variant={variant} rows={[{ ...target, status }]}
      waiting={false} loading={false} selectedTargetId={target.target_id} selection={{}} busy={false}
      hasNextPage={false} fetchingNextPage={false} filtered={false} imageManifest={{}}
      onSelect={vi.fn()} onToggle={vi.fn()} onMore={vi.fn()} onReset={vi.fn()} />);
    const row = screen.getByRole("button", { name: new RegExp(label) });
    expect(row.style.background).toContain(`var(--c-${tone})`);
    fireEvent.mouseEnter(row);
    expect(row.style.background).toContain(`var(--c-${tone})`);
    expect(row.style.boxShadow).toContain("inset 3px");
  });

  it.each(["desktop", "mobile"] as const)("%s 선택은 상태 표시를 유지하고 행 열기를 실행하지 않는다", variant => {
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    const onSelect = vi.fn();
    render(<StocktakeTargetList variant={variant} rows={[target]} waiting loading={false}
      selection={{ [target.target_id]: target }} selectionTotal={1} busy={false}
      hasNextPage={false} fetchingNextPage={false} filtered={false} imageManifest={{}}
      onSelect={onSelect} onToggle={onToggle} onToggleAll={onToggleAll} onMore={vi.fn()} onReset={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: "시험 품목 선택" });
    const cell = checkbox.closest("td")!;
    if (variant === "desktop") {
      expect(screen.getByRole("columnheader", { name: "상태", exact: true })).toBeInTheDocument();
      expect(cell).not.toHaveTextContent("대기");
      expect(cell.nextElementSibling).toHaveTextContent("대기");
    } else {
      expect(cell).toHaveTextContent("대기");
      expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    }
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(target, false);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "전체 선택" }));
    expect(onToggleAll).toHaveBeenCalledWith(false);
  });
});
