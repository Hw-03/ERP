import { fireEvent, render, screen } from "@testing-library/react";
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
  it("모바일에서는 품목 확인 정보를 단일 열로, 데스크톱에서는 기존 다섯 열로 배치한다", () => {
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

    const header = screen.getAllByRole("button", { name: /ADX6000 80KV 5mA/ })
      .find((element) => element.hasAttribute("aria-expanded"));
    if (!header) throw new Error("묶음 접기/펼치기 영역을 찾을 수 없습니다.");
    expect(header).toHaveClass("grid-cols-1");
    expect(header).toHaveClass("lg:grid-cols-[minmax(0,1.6fr)_minmax(132px,auto)_minmax(80px,auto)_minmax(80px,auto)_44px]");
  });

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

  it("수량 조정과 삭제는 묶음을 펼치지 않고 기존 핸들러만 호출한다", () => {
    const onQuantityChange = vi.fn();
    const onRemoveBundle = vi.fn();
    render(
      <IoBundleCard
        bundle={bundle}
        subType="produce"
        itemMap={itemMap}
        getAvailable={() => 10}
        onToggleLine={() => {}}
        onQuantityChange={onQuantityChange}
        onBundleQuantityChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={onRemoveBundle}
      />,
    );

    const header = screen.getAllByRole("button", { name: /ADX6000 80KV 5mA/ })
      .find((element) => element.hasAttribute("aria-expanded"));
    if (!header) throw new Error("묶음 접기/펼치기 영역을 찾을 수 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    fireEvent.click(screen.getByTitle("묶음 삭제"));

    expect(onQuantityChange).toHaveBeenCalledWith("parent-line", 3, 0);
    expect(onRemoveBundle).toHaveBeenCalledOnce();
    expect(header).toHaveAttribute("aria-expanded", "false");
  });
});
