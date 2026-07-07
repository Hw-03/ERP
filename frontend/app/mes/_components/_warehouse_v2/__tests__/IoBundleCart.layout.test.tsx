import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, Item } from "@/lib/api";
import { IoBundleCart } from "../IoBundleCart";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#64748b",
}));

const line = {
  line_id: "line-1",
  item_id: "item-1",
  item_name: "DX3000 TEST",
  mes_code: "3-PA-0001",
  unit: "EA",
  direction: "in",
  from_bucket: "none",
  from_department: null,
  to_bucket: "warehouse",
  to_department: null,
  quantity: 2,
  bom_expected: null,
  included: true,
  origin: "direct",
  edited: false,
  has_children: false,
  shortage: 0,
  exclusion_note: null,
} satisfies IoBundle["lines"][number];

const bundle = {
  bundle_id: "bundle-1",
  source_kind: "manual",
  title: "DX3000 TEST",
  source_item_id: "item-1",
  source_mes_code: "3-PA-0001",
  quantity: 2,
  expanded_level: 0,
  lines: [line],
} satisfies IoBundle;

const item = {
  item_id: "item-1",
  item_name: "DX3000 TEST",
  mes_code: "3-PA-0001",
  warehouse_qty: 10,
  pending_quantity: 0,
  locations: [],
} as unknown as Item;

describe("IoBundleCart layout", () => {
  it("keeps helper copy in the summary row and scrolls only the bundle list", () => {
    const { container } = render(
      <IoBundleCart
        bundles={[bundle]}
        subType="warehouse_to_dept"
        itemMap={new Map([[item.item_id, item]])}
        getAvailable={() => 10}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
        onAdvance={vi.fn()}
        canAdvance
      />,
    );

    expect(screen.queryByTestId("io-bundle-cart-standalone-help")).not.toBeInTheDocument();
    expect(screen.getByText("체크를 해제하면 이번 작업에서 제외됩니다.")).toBeInTheDocument();
    expect(container.querySelector("[data-keep-scroll].overflow-y-auto")).toBeInTheDocument();
    expect(container.querySelector("[data-keep-scroll].sg")).toBeInTheDocument();
  });
});
