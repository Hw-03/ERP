import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, Item } from "@/lib/api";
import { IoBundleCard } from "../IoBundleCard";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#64748b",
}));

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

function makeInternalUseBundle(
  mode: "parent_and_children" | "children_only" | null,
): IoBundle {
  return {
    ...bundle,
    quantity: 11,
    internal_use_bom_mode: mode,
    source_location: "warehouse",
    lines: [
      {
        ...parentLine,
        direction: "out",
        from_bucket: "warehouse",
        to_bucket: "none",
        to_department: null,
        quantity: 11,
        included: mode === "parent_and_children",
      },
      {
        ...childLine,
        direction: "out",
        from_bucket: "warehouse",
        from_department: null,
        to_bucket: "none",
        to_department: "연구",
        quantity: 11,
        selected: true,
      },
    ],
  };
}

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

  it("묶음 삭제 버튼은 수량 행과 같은 44px 버튼과 20px 아이콘을 사용한다", () => {
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

    const removeButton = screen.getByRole("button", { name: "묶음 삭제" });
    expect(removeButton).toHaveClass("h-11", "w-11");
    expect(removeButton.querySelector("svg")).toHaveClass("h-5", "w-5");
  });

  it("internal-use BOM header summarizes multiple deduction locations before quantity controls", () => {
    const multiSourceBundle = {
      ...bundle,
      lines: [
        parentLine,
        {
          ...childLine,
          direction: "out" as const,
          from_bucket: "warehouse" as const,
          to_bucket: "none" as const,
          to_department: null,
        },
        {
          ...childLine,
          line_id: "department-child",
          direction: "out" as const,
          from_bucket: "production" as const,
          from_department: "고압",
          to_bucket: "none" as const,
          to_department: null,
        },
      ],
    } satisfies IoBundle;

    render(
      <IoBundleCard
        bundle={multiSourceBundle}
        subType="internal_use_out"
        itemMap={itemMap}
        getAvailable={() => 10}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    const sourceBadge = screen.getByLabelText("차감 위치: 2개 위치");
    expect(sourceBadge).toHaveClass("min-w-[112px]", "flex-col", "gap-0.5");
    expect(screen.getByText("차감 위치")).toHaveClass("text-xs", "tracking-[1.5px]");
    const sourceContent = screen.getByText("2개 위치").parentElement;
    expect(sourceContent).toHaveClass(
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-1.5",
    );
    expect(sourceContent?.parentElement).toHaveClass(
      "h-11",
      "min-h-[44px]",
      "rounded-[10px]",
    );
    expect(
      sourceBadge.compareDocumentPosition(
        screen.getByRole("spinbutton", { name: "기준 수량" }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("사용출고 BOM 차감 방식 버튼을 차감 위치 왼쪽에 정식 명칭으로 배치한다", () => {
    const onModeChange = vi.fn();

    render(
      <IoBundleCard
        bundle={makeInternalUseBundle(null)}
        subType="internal_use_out"
        itemMap={itemMap}
        getAvailable={(line) => line.line_id === "parent-line" ? 60 : 39}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onInternalUseBomModeChange={onModeChange}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    const group = screen.getByRole("group", { name: "BOM 차감 방식" });
    const header = group.closest("div.relative.mb-3");
    expect(header).toHaveClass("lg:grid-cols-[minmax(0,1.6fr)_minmax(208px,auto)_minmax(112px,auto)_minmax(132px,auto)_minmax(80px,auto)_minmax(80px,auto)_44px]");
    expect(group).toHaveClass("flex", "flex-col", "gap-0.5");
    expect(within(group).getByText("차감 방식")).toHaveClass(
      "text-xs",
      "tracking-[1.5px]",
    );
    const parentAndChildren = screen.getByRole("button", { name: "상·하위 차감" });
    const childrenOnly = screen.getByRole("button", { name: "하위만 차감" });
    expect(within(parentAndChildren).getByText("상·하위 차감")).toBeInTheDocument();
    expect(within(childrenOnly).getByText("하위만 차감")).toBeInTheDocument();
    expect(parentAndChildren).toHaveClass(
      "h-11",
      "min-h-[44px]",
      "rounded-[10px]",
      "text-sm",
    );
    expect(parentAndChildren).toHaveAttribute("aria-pressed", "false");
    expect(childrenOnly).toHaveAttribute("aria-pressed", "false");

    const deductionSource = within(header as HTMLElement).getByLabelText("차감 위치: 창고");
    expect(group.compareDocumentPosition(deductionSource)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const stock = screen.getByRole("group", { name: "상위 자재 재고" });
    expect(stock).toHaveClass("grid-cols-2");
    expect(stock).toHaveClass("lg:col-span-2");
    expect(within(stock).getByLabelText("가능 재고 60")).toBeInTheDocument();
    expect(within(stock).getByLabelText("실행 후 -")).toBeInTheDocument();
    expect(screen.queryByText("상위 자재 재고 요약")).not.toBeInTheDocument();

    fireEvent.click(parentAndChildren);
    fireEvent.click(childrenOnly);

    expect(onModeChange).toHaveBeenNthCalledWith(1, "parent_and_children");
    expect(onModeChange).toHaveBeenNthCalledWith(2, "children_only");
  });

  it.each([
    ["parent_and_children", "49"],
    ["children_only", "60"],
  ] as const)("사용출고 BOM %s 모드의 상위 실행 후 재고를 헤더에 표시한다", (mode, expected) => {
    render(
      <IoBundleCard
        bundle={makeInternalUseBundle(mode)}
        subType="internal_use_out"
        itemMap={itemMap}
        getAvailable={(line) => line.line_id === "parent-line" ? 60 : 39}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onInternalUseBomModeChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    const stock = screen.getByRole("group", { name: "상위 자재 재고" });
    expect(within(stock).getByLabelText(`실행 후 ${expected}`)).toBeInTheDocument();
    expect(screen.queryByText("상위 자재 재고 요약")).not.toBeInTheDocument();
  });

  it("하위만 차감 응답에 상위 라인이 없어도 창고 예약을 뺀 상위 재고를 표시한다", () => {
    const childrenOnlyBundle = {
      ...makeInternalUseBundle("children_only"),
      lines: makeInternalUseBundle("children_only").lines.filter(
        (line) => line.origin !== "direct",
      ),
    } satisfies IoBundle;
    const parentInventory = {
      warehouse_qty: 60,
      pending_quantity: 5,
      available_quantity: 100,
      locations: [],
    } as Item;

    render(
      <IoBundleCard
        bundle={childrenOnlyBundle}
        subType="internal_use_out"
        itemMap={new Map([["parent-item", parentInventory]])}
        getAvailable={() => 39}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onInternalUseBomModeChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    const stock = screen.getByRole("group", { name: "상위 자재 재고" });
    expect(within(stock).getByLabelText("가능 재고 55")).toBeInTheDocument();
    expect(within(stock).getByLabelText("실행 후 55")).toBeInTheDocument();
  });

  it("부서 원본 상위 라인이 없으면 서버와 같은 공정 부서 규칙으로 재고를 표시한다", () => {
    const childrenOnlyBundle = {
      ...makeInternalUseBundle("children_only"),
      source_location: "department" as const,
      lines: makeInternalUseBundle("children_only").lines.filter(
        (line) => line.origin !== "direct",
      ),
    } satisfies IoBundle;
    const parentInventory = {
      warehouse_qty: 0,
      pending_quantity: 0,
      available_quantity: 159,
      process_type_code: null,
      locations: [
        { department: "조립", status: "PRODUCTION", quantity: 65, pending_quantity: 5, available_quantity: 60 },
        { department: "고압", status: "PRODUCTION", quantity: 99, pending_quantity: 0, available_quantity: 99 },
      ],
    } as Item;

    render(
      <IoBundleCard
        bundle={childrenOnlyBundle}
        subType="internal_use_out"
        itemMap={new Map([["parent-item", parentInventory]])}
        getAvailable={() => 39}
        onToggleLine={() => {}}
        onQuantityChange={() => {}}
        onBundleQuantityChange={vi.fn()}
        onInternalUseBomModeChange={vi.fn()}
        onRemoveLine={() => {}}
        onRemoveBundle={() => {}}
      />,
    );

    const stock = screen.getByRole("group", { name: "상위 자재 재고" });
    expect(within(stock).getByLabelText("가능 재고 60")).toBeInTheDocument();
    expect(within(stock).getByLabelText("실행 후 60")).toBeInTheDocument();
  });

  it("사용출고 BOM 재계산 중에는 묶음의 모든 재고 편집을 잠근다", () => {
    const internalUseBundle = {
      ...bundle,
      internal_use_bom_mode: "children_only" as const,
      source_location: "warehouse" as const,
      lines: [{
        ...childLine,
        direction: "out" as const,
        from_bucket: "warehouse" as const,
        from_department: null,
        to_bucket: "none" as const,
        to_department: "연구",
        selected: true,
      }],
    } satisfies IoBundle;

    render(
      <IoBundleCard
        bundle={internalUseBundle}
        subType="internal_use_out"
        itemMap={itemMap}
        getAvailable={() => 10}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onBundleQuantityChange={vi.fn()}
        onInternalUseBomModeChange={vi.fn()}
        internalUseBomBusy
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
      />,
    );

    const header = screen.getAllByRole("button", { name: /ADX6000 80KV 5mA/ })
      .find((element) => element.hasAttribute("aria-expanded"));
    if (!header) throw new Error("묶음 접기/펼치기 영역을 찾을 수 없습니다.");
    fireEvent.click(header);

    expect(screen.getByRole("button", { name: "상·하위 차감" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "기준 수량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "재고 반영 변경" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "수량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "묶음 삭제" })).toBeDisabled();
  });
});
