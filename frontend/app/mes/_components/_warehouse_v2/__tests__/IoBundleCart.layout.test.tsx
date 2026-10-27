import { fireEvent, render, screen } from "@testing-library/react";
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
  it.each([false, true])("수량 조정의 메모는 전달된 상태를 수정하고 삭제한다 (mobile=%s)", (mobilePresentation) => {
    const onNotesChange = vi.fn();
    const props = { mobilePresentation, bundles: [bundle], workType: "warehouse_io" as const, subType: "warehouse_to_dept" as const,
      notes: "기존 메모", onNotesChange, itemMap: new Map([[item.item_id, item]]), getAvailable: () => 10,
      onToggleLine: vi.fn(), onQuantityChange: vi.fn(), onRemoveLine: vi.fn(), onRemoveBundle: vi.fn(), onAdvance: vi.fn(), canAdvance: true };
    const { rerender, container } = render(<IoBundleCart {...props} />);
    const memo = screen.getByRole("textbox", { name: "메모 (선택)" });
    expect(memo).toHaveValue("기존 메모");
    expect(container.querySelector("[data-io-cart-list]")).not.toContainElement(memo);
    fireEvent.change(memo, { target: { value: "변경 메모" } });
    expect(onNotesChange).toHaveBeenLastCalledWith("변경 메모");
    rerender(<IoBundleCart {...props} notes="변경 메모" />);
    expect(memo).toHaveValue("변경 메모");
    fireEvent.change(memo, { target: { value: "" } });
    expect(onNotesChange).toHaveBeenLastCalledWith("");
  });
  it.each(["receive_supplier", "warehouse_to_dept", "adjust_in", "internal_use_out", "warehouse_adjust_in"] as const)(
    "%s 모바일 수량 목록은 카드 밖 레일과 고정 프레임을 사용한다",
    (subType) => {
    const { container } = render(
      <IoBundleCart
        mobilePresentation
        bundles={[bundle]}
        subType={subType}
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
    expect(container.querySelector("[data-io-cart-shell]")).toHaveStyle({ background: "var(--c-s2)" });
    const viewport = container.querySelector("[data-io-cart-list][data-keep-scroll]");
    expect(viewport).toBeInTheDocument();
    expect(viewport).not.toHaveStyle({ background: "var(--c-s2)" });
    expect(container.querySelector("[data-io-cart-frame]")).toBeInTheDocument();
    expect(container.querySelector("[data-io-cart-actions]")).toBeInTheDocument();
    },
  );

  it("PC 수량 목록은 기존 스크롤 요소에 카드를 직접 배치한다", () => {
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

    expect(container.querySelector("[data-io-cart-shell]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-io-cart-list] [data-io-line]")).toBeInTheDocument();
  });

  it("removes the old summary helper copy and scrolls only the bundle list", () => {
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
    expect(container.querySelector("[data-keep-scroll].overflow-y-auto")).toBeInTheDocument();
    expect(container.querySelector("[data-keep-scroll].sg")).toBeInTheDocument();
  });

  it("names the warehouse pull scope before the user clicks", () => {
    const shortageBundle = {
      ...bundle,
      lines: [{ ...line, shortage: 2 }],
    } satisfies IoBundle;

    const { rerender } = render(
      <IoBundleCart
        bundles={[shortageBundle]}
        subType="warehouse_to_dept"
        itemMap={new Map([[item.item_id, item]])}
        getAvailable={() => 0}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
        onAdvance={vi.fn()}
        canAdvance={false}
        hasShortage
        pullEnabled
        pullCount={1}
        onPullFromWarehouse={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "재고가 부족한 항목이 있습니다 · 부족 1개 전체 가져오기" })).toBeInTheDocument();

    rerender(
      <IoBundleCart
        bundles={[shortageBundle]}
        subType="warehouse_to_dept"
        itemMap={new Map([[item.item_id, item]])}
        getAvailable={() => 0}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
        onAdvance={vi.fn()}
        canAdvance={false}
        hasShortage
        pullEnabled
        pullSelected={new Set(["line-1"])}
        pullCount={1}
        onPullFromWarehouse={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "재고가 부족한 항목이 있습니다 · 선택한 1개 가져오기" })).toBeInTheDocument();
  });

  it("현재 부족이 해결되면 중복 안내와 가져오기 버튼을 숨기고 작업 반영 버튼을 남긴다", () => {
    const props = {
      bundles: [bundle], subType: "warehouse_to_dept" as const,
      itemMap: new Map([[item.item_id, item]]), getAvailable: () => 10,
      onToggleLine: vi.fn(), onQuantityChange: vi.fn(), onRemoveLine: vi.fn(),
      onRemoveBundle: vi.fn(), onAdvance: vi.fn(), onSaveDraft: vi.fn(),
      canAdvance: false, pullEnabled: true,
      onPullFromWarehouse: vi.fn(),
    };
    const { rerender } = render(<IoBundleCart {...props} />);

    expect(screen.queryByText("작업 내용을 반영한 뒤 제출해 주세요.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /가져오기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업 중 등록" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "제출확인 →" })).toBeDisabled();

    rerender(<IoBundleCart {...props} hasShortage />);
    expect(screen.queryByText("작업 내용을 반영한 뒤 제출해 주세요.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /가져오기/ })).toBeInTheDocument();
  });

  it("재계산 중에는 임시저장과 다음 단계 이동을 막는다", () => {
    render(
      <IoBundleCart
        bundles={[bundle]}
        subType="internal_use_out"
        itemMap={new Map([[item.item_id, item]])}
        getAvailable={() => 10}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
        onAdvance={vi.fn()}
        onSaveDraft={vi.fn()}
        internalUseBomBusy
        canAdvance
      />,
    );

    expect(screen.getByRole("button", { name: "작업 중 등록" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제출확인 →" })).toBeDisabled();
  });

  it("반영 품목이 없거나 수량 0인 반영 품목이 있으면 제출확인 차단 이유를 표시한다", () => {
    const { rerender } = render(
      <IoBundleCart
        bundles={[{ ...bundle, lines: [{ ...line, quantity: 0, included: false }] }]}
        subType="warehouse_to_dept"
        itemMap={new Map([[item.item_id, item]])}
        getAvailable={() => 10}
        onToggleLine={vi.fn()}
        onQuantityChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onRemoveBundle={vi.fn()}
        onAdvance={vi.fn()}
        canAdvance={false}
      />,
    );

    expect(screen.getByText("반영할 품목을 하나 이상 선택하세요")).toBeInTheDocument();

    rerender(
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
        canAdvance={false}
        hasInvalidQuantity
        invalidLineCodes={["7-AA-0052"]}
      />,
    );

    expect(screen.getByText("수량 0: 7-AA-0052")).toBeInTheDocument();
  });
});
