import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, Item } from "@/lib/api";
import { IoBundleCard } from "../IoBundleCard";

const parentLine = {
  line_id: "parent-line",
  item_id: "parent-item",
  item_name: "ADX6000 80KV 5mA / 긴 상위 품목명",
  mes_code: "6-AF-0024",
  unit: "EA",
  direction: "in",
  from_bucket: "none",
  from_department: null,
  to_bucket: "production",
  to_department: "조립",
  quantity: 2,
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
  item_name: "ADX4000W TP-LINK (WAN1000M)-동글",
  mes_code: "46-AR-0071",
  origin: "bom_auto",
  bom_expected: 2,
} satisfies IoBundle["lines"][number];

const bundle = {
  bundle_id: "bundle-1",
  source_kind: "bom_parent",
  title: "ADX6000 80KV 5mA / 긴 상위 품목명",
  source_item_id: "parent-item",
  source_mes_code: "6-AF-0024",
  quantity: 2,
  expanded_level: 1,
  lines: [parentLine, childLine],
} satisfies IoBundle;

const itemMap = new Map<string, Item>();

describe("IoBundleCard", () => {
  it("uses the shared accessible quantity stepper for the BOM parent quantity", () => {
    render(
      <IoBundleCard
        bundle={bundle}
        subType="produce"
        itemMap={itemMap}
        getAvailable={() => 10}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: "기준 수량" })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("button", { name: "-1" })).toHaveClass("min-h-[44px]");
  });
});
