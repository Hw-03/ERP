import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, IoLine, Item } from "@/lib/api";
import { MobileSingleAdjustForm } from "../MobileSingleAdjustForm";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "item-1",
    item_name: "CTR Board",
    mes_code: "CTR-001",
    unit: "EA",
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: "CTR",
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    department: null,
    ...overrides,
  } as Item;
}

function makeBundle(): IoBundle {
  const line: IoLine = {
    line_id: "line-1",
    item_id: "item-1",
    item_name: "CTR Board",
    mes_code: "CTR-001",
    unit: "EA",
    direction: "out",
    from_bucket: "production",
    from_department: "조립",
    to_bucket: "none",
    to_department: null,
    quantity: 1,
    bom_expected: null,
    included: true,
    origin: "manual",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
  };

  return {
    bundle_id: "bundle-1",
    source_kind: "manual",
    title: "CTR Board",
    source_item_id: "item-1",
    source_mes_code: "CTR-001",
    quantity: 1,
    expanded_level: 0,
    lines: [line],
  };
}

function Harness({
  bundles = [],
  onAddItem = vi.fn(),
  onSaveDraft = vi.fn(),
}: {
  bundles?: IoBundle[];
  onAddItem?: (item: Item) => void;
  onSaveDraft?: () => void;
}) {
  const [search, setSearch] = useState("CTR");

  return (
    <MobileSingleAdjustForm
      subType="adjust_out"
      items={[makeItem()]}
      bundles={bundles}
      search={search}
      onSearchChange={setSearch}
      onAddItem={onAddItem}
      onBundleQuantityChange={() => {}}
      onRemoveBundle={() => {}}
      getAvailable={() => 10}
      onScan={() => {}}
      onSaveDraft={onSaveDraft}
      saving={false}
      onSubmit={() => {}}
      submitting={false}
      busy={false}
      error={null}
    />
  );
}

describe("MobileSingleAdjustForm", () => {
  it("clears search, collapses results, and refocuses the input after adding an item", async () => {
    const onAddItem = vi.fn();
    render(<Harness onAddItem={onAddItem} />);

    fireEvent.click(screen.getByRole("button", { name: /CTR Board/ }));

    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }));
    const input = screen.getByPlaceholderText("품목명 또는 코드");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByRole("button", { name: /CTR Board/ })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("shows a visible draft save action beside the single submit action", () => {
    const onSaveDraft = vi.fn();
    render(<Harness bundles={[makeBundle()]} onSaveDraft={onSaveDraft} />);

    fireEvent.click(screen.getByRole("button", { name: /작성 중 저장/ }));

    expect(screen.getByRole("button", { name: /단품 출고 제출/ })).toBeInTheDocument();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });
});
