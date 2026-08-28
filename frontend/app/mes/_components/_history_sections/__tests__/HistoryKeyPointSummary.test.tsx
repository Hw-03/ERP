import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InventoryEffectRow } from "../historyInventoryEffect";
import type { HistoryDetailSummary } from "../historyDetailSummary";
import { DesktopRightPanel } from "../../DesktopRightPanel";
import { HistoryKeyPointSummary } from "../HistoryKeyPointSummary";

function effect(overrides: Partial<InventoryEffectRow> = {}): InventoryEffectRow {
  return {
    key: "item-finished:EA:location::조립:PRODUCTION:",
    scope: "location",
    itemId: "item-finished",
    itemName: "완제품 A",
    unit: "EA",
    locationId: null,
    boxId: null,
    department: "조립",
    status: "PRODUCTION",
    label: "조립 재고",
    delta: 1,
    deltaLabel: "+1",
    ...overrides,
  };
}

function summary(overrides: Partial<HistoryDetailSummary> = {}): HistoryDetailSummary {
  return {
    target: { itemId: "item-finished", itemName: "완제품 A", mesCode: "PF-001" },
    operationLabel: "생산",
    status: { label: "완료", tone: "success", reason: null },
    impactGroups: [{ key: "actual", label: null, effects: [effect()] }],
    conversion: null,
    requester: { label: "요청자", name: "요청자 A", at: "2026-07-10T01:00:00Z" },
    flow: null,
    composition: null,
    impactIdentity: "log-1",
    ...overrides,
  };
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

describe("HistoryKeyPointSummary", () => {
  it("renders each key point once without repeating the panel header target or stale stock", () => {
    render(<HistoryKeyPointSummary summary={summary()} />);

    expect(screen.getAllByText("생산")).toHaveLength(1);
    expect(screen.getAllByText("완료")).toHaveLength(1);
    expect(screen.getAllByText("요청자 A")).toHaveLength(1);
    expect(screen.getByText("재고 변화")).toBeInTheDocument();
    expect(screen.getByText("조립 재고")).toBeInTheDocument();
    expect(screen.getByText("+1 EA")).toBeInTheDocument();
    expect(screen.getByText("완제품 A")).toBeInTheDocument();
    expect(screen.queryByText(/처리 전|처리 후|창고 401/)).not.toBeInTheDocument();
  });

  it("renders the requester name without a redundant requester label", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          requester: {
            label: "담당자",
            name: "준비 완료자 B",
            at: "2026-07-10T01:00:00Z",
          } as HistoryDetailSummary["requester"],
        })}
      />,
    );

    expect(screen.getByText("준비 완료자 B")).toBeInTheDocument();
    expect(screen.queryByText("담당자")).not.toBeInTheDocument();
    expect(screen.queryByText("요청자")).not.toBeInTheDocument();
  });

  it("keeps the operation and location route on their section title lines", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          operationLabel: "불량 격리",
          flow: { label: "불량 재고", from: "불량 재고", to: "조립 재고" },
        })}
      />,
    );

    const operation = screen.getByTestId("history-operation-summary");
    const flow = screen.getByTestId("history-flow-summary");

    expect(operation).toHaveClass("items-center");
    expect(within(operation).getByText("불량 격리")).toBeInTheDocument();
    expect(within(operation).queryByText("작업")).not.toBeInTheDocument();
    expect(flow).toHaveClass("items-center", "flex-nowrap");
    expect(within(flow).getByText("위치 / 이동 경로")).toBeInTheDocument();
    expect(within(flow).getByText("불량 재고")).toBeInTheDocument();
    expect(within(flow).getByText("조립 재고")).toBeInTheDocument();
  });

  it("groups production output and components without merging their rows", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [
            {
              key: "output",
              label: "완제품",
              effects: [effect({ delta: 2, deltaLabel: "+2" })],
            },
            {
              key: "component",
              label: "부품",
              effects: [
                effect({
                  key: "item-a:EA:location::조립:PRODUCTION:",
                  itemId: "item-a",
                  itemName: "부품 A",
                  delta: -2,
                  deltaLabel: "-2",
                }),
                effect({
                  key: "item-b:EA:location::조립:PRODUCTION:",
                  itemId: "item-b",
                  itemName: "부품 B",
                  delta: -3,
                  deltaLabel: "-3",
                }),
              ],
            },
          ],
        })}
      />,
    );

    const output = screen.getByRole("button", { name: "완제품 · 1품목 · +2" });
    const components = screen.getByRole("button", { name: "부품 · 2품목 · -5" });
    expect(output).toHaveAttribute("aria-expanded", "false");
    expect(components).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(output);
    fireEvent.click(components);
    expect(screen.getByText("완제품 A")).toBeInTheDocument();
    expect(screen.getByText("부품 A")).toBeInTheDocument();
    expect(screen.getByText("부품 B")).toBeInTheDocument();
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
    expect(screen.getByText("-2 EA")).toBeInTheDocument();
    expect(screen.getByText("-3 EA")).toBeInTheDocument();
  });

  it("shows an item conversion conclusion and one unified inventory impact list", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          conversion: {
            source: { itemId: "source", itemName: "기존품", mesCode: "SRC-001" },
            target: { itemId: "target", itemName: "변경품", mesCode: "TGT-001" },
          },
          impactGroups: [{
            key: "actual",
            label: null,
            effects: [
              effect({
                itemId: "target",
                itemName: "변경품",
                mesCode: "TGT-001",
                role: "완제품",
                delta: 2,
                deltaLabel: "+2",
              }),
              effect({
                key: "component:EA:location::조립:PRODUCTION:",
                itemId: "component",
                itemName: "BOM 부품",
                mesCode: "R-001",
                role: "부품",
                delta: -3,
                deltaLabel: "-3",
                mismatchLabel: "BOM 4 EA",
              }),
            ],
          }],
        })}
      />,
    );

    expect(screen.getByText("기존품")).toBeInTheDocument();
    expect(screen.getByText("SRC-001")).toBeInTheDocument();
    expect(screen.getAllByText("변경품")).toHaveLength(2);
    expect(screen.getByText("TGT-001")).toBeInTheDocument();
    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.getByText("부품")).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => (
      element?.textContent === "조립 재고"
    ))).toHaveLength(2);
  });

  it("places requester metadata before conversion and inventory change", () => {
    const { container } = render(
      <HistoryKeyPointSummary
        summary={summary({
          conversion: {
            source: { itemId: "source", itemName: "기존품", mesCode: "SRC-001" },
            target: { itemId: "target", itemName: "변경품", mesCode: "TGT-001" },
          },
        })}
      />,
    );

    const requester = screen.getByText("요청자 A");
    const conversion = screen.getByText("품목 전환");
    const impact = screen.getByText("재고 변화");

    expect(requester.compareDocumentPosition(conversion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(requester.compareDocumentPosition(impact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-testid='history-key-point-summary']")).toContainElement(requester);
  });

  it("starts every location collapsed when an operation affects multiple locations", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [
            { key: "warehouse", label: "창고 재고", effects: [effect({ label: "창고 재고", delta: -10, deltaLabel: "-10" })] },
            { key: "location:출하", label: "출하 재고", effects: [effect({ key: "outbound", label: "출하 재고", itemName: "출하 품목", delta: 10, deltaLabel: "+10" })] },
          ],
        })}
      />,
    );

    const warehouse = screen.getByRole("button", { name: "창고 재고 · 1품목 · -10" });
    const outbound = screen.getByRole("button", { name: "출하 재고 · 1품목 · +10" });
    expect(warehouse).toHaveAttribute("aria-expanded", "false");
    expect(outbound).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("출하 품목")).not.toBeInTheDocument();

    fireEvent.click(outbound);
    expect(outbound).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("출하 품목")).toBeInTheDocument();
    expect(warehouse).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the signed total in a collapsed shipping impact header", () => {
    const shippingEffects = Array.from({ length: 12 }, (_, index) => effect({
      key: `shipping-${index + 1}`,
      itemId: `shipping-item-${index + 1}`,
      itemName: `Shipping item ${index + 1}`,
      label: "출하 재고",
      delta: -1,
      deltaLabel: "-1",
    }));

    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [
            { key: "warehouse", label: "창고 재고", effects: [effect({ label: "창고 재고" })] },
            { key: "shipping", label: "출하 재고", effects: shippingEffects },
          ],
        })}
      />,
    );

    const shipping = screen.getByRole("button", { name: "출하 재고 · 12품목 · -12" });
    expect(shipping).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(shipping);
    expect(screen.getAllByText("-1 EA")).toHaveLength(12);
  });

  it("shows totals only for nonzero single-unit groups and keeps detail row units", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [
            {
              key: "positive",
              label: "완제품 재고",
              effects: [
                effect({ key: "positive-1", delta: 2, deltaLabel: "+2" }),
                effect({ key: "positive-2", delta: 3, deltaLabel: "+3" }),
              ],
            },
            {
              key: "negative",
              label: "부품 재고",
              effects: [
                effect({ key: "negative-1", delta: -2, deltaLabel: "-2" }),
                effect({ key: "negative-2", delta: -3, deltaLabel: "-3" }),
              ],
            },
            {
              key: "mixed-unit",
              label: "혼합 단위 재고",
              effects: [
                effect({ key: "mixed-1", delta: 2, deltaLabel: "+2", unit: "EA" }),
                effect({ key: "mixed-2", delta: 3, deltaLabel: "+3", unit: "BOX" }),
              ],
            },
            {
              key: "zero-total",
              label: "상쇄 재고",
              effects: [
                effect({ key: "zero-1", delta: 2, deltaLabel: "+2" }),
                effect({ key: "zero-2", delta: -2, deltaLabel: "-2" }),
              ],
            },
            {
              key: "empty-unit",
              label: "단위 없는 재고",
              effects: [
                effect({ key: "empty-1", delta: 2, deltaLabel: "+2", unit: "" }),
                effect({ key: "empty-2", delta: 3, deltaLabel: "+3", unit: "" }),
              ],
            },
          ],
        })}
      />,
    );

    const positive = screen.getByRole("button", { name: "완제품 재고 · 2품목 · +5" });
    expect(screen.getByRole("button", { name: "부품 재고 · 2품목 · -5" })).toBeInTheDocument();
    const mixedUnit = screen.getByRole("button", { name: "혼합 단위 재고 · 2품목" });
    expect(screen.getByRole("button", { name: "상쇄 재고 · 2품목" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "단위 없는 재고 · 2품목" })).toBeInTheDocument();

    fireEvent.click(positive);
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
    expect(screen.getByText("+3 EA")).toBeInTheDocument();

    fireEvent.click(mixedUnit);
    const mixedUnitDetails = document.getElementById(mixedUnit.getAttribute("aria-controls")!);
    expect(within(mixedUnitDetails!).getByText("+2 EA")).toBeInTheDocument();
    expect(within(mixedUnitDetails!).getByText("+3 BOX")).toBeInTheDocument();
  });

  it("does not truncate the requester timestamp", () => {
    render(<HistoryKeyPointSummary summary={summary()} />);

    const timestamp = screen.getByText(/2026년 7월 10일/);
    expect(timestamp).not.toHaveClass("truncate");
    expect(timestamp).toHaveClass("whitespace-nowrap");
  });

  it("collapses a single location when its expanded detail overflows the panel body", () => {
    render(
      <DesktopRightPanel title="Detail">
        <HistoryKeyPointSummary
          summary={summary({
            impactGroups: [{ key: "single", label: "Single location", effects: [effect({ label: "Single location" })] }],
          })}
        />
      </DesktopRightPanel>,
    );

    const body = screen.getByTestId("desktop-right-panel-body");
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 240 });
    fireEvent(window, new Event("resize"));

    const header = screen.getByRole("button", { name: /Single location/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header!);
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent(window, new Event("resize"));
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the location or movement route in the desktop summary only when it exists", () => {
    const { rerender } = render(
      <HistoryKeyPointSummary
        summary={summary({ flow: { label: "조립 재고", from: "창고", to: "조립" } })}
      />,
    );

    expect(screen.getByText("위치 / 이동 경로")).toBeInTheDocument();
    expect(screen.getByText("창고")).toBeInTheDocument();
    expect(screen.getByText("조립")).toBeInTheDocument();

    rerender(<HistoryKeyPointSummary summary={summary({ flow: null })} />);
    expect(screen.queryByText("위치 / 이동 경로")).not.toBeInTheDocument();
  });

  it("keeps partial impacts hidden while the complete scope is loading or failed", () => {
    const onRetryImpact = vi.fn();
    const { rerender } = render(
      <HistoryKeyPointSummary
        summary={summary({ impactGroups: [] })}
        impactStatus="loading"
      />,
    );

    expect(screen.getByText("재고 변화 불러오는 중")).toBeInTheDocument();

    rerender(
      <HistoryKeyPointSummary
        summary={summary({ impactGroups: [] })}
        impactStatus="error"
        onRetryImpact={onRetryImpact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "재고 변화 다시 불러오기" }));
    expect(onRetryImpact).toHaveBeenCalledOnce();
  });

  it("shows an overflowing impact item name from the entire row on hover and focus", async () => {
    const longName = "An exceptionally long inventory impact item name".repeat(6);
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [{
            key: "actual",
            label: null,
            effects: [effect({ itemName: longName, role: "Finished", deltaLabel: "+5", delta: 5 })],
          }],
        })}
      />,
    );

    const itemName = screen.getByText(longName);
    setBoxMetrics(itemName, { clientWidth: 100, scrollWidth: 420, clientHeight: 20, scrollHeight: 20 });

    const row = itemName.closest("[class*='min-h-11']")!;
    const trigger = row.parentElement!;
    await waitFor(() => expect(trigger).toHaveAttribute("tabindex", "0"));
    expect(trigger).toContainElement(row);
    expect(trigger).toHaveTextContent("Finished");
    expect(trigger).toHaveTextContent("+5 EA");

    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName);
    fireEvent.mouseLeave(trigger);

    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName);
  });

  it("does not add an impact-row tooltip or focus stop when the item name fits", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [{ key: "actual", label: null, effects: [effect({ itemName: "Fits" })] }],
        })}
      />,
    );

    const itemName = screen.getByText("Fits");
    setBoxMetrics(itemName, { clientWidth: 160, scrollWidth: 160, clientHeight: 20, scrollHeight: 20 });

    const row = itemName.closest("[class*='min-h-11']")!;
    const trigger = row.parentElement!;
    expect(trigger).not.toHaveAttribute("tabindex");
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders BOM-backed inventory changes as read-only rows", () => {
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [{
            key: "actual",
            label: null,
            effects: [effect({ role: "부품", delta: -2, deltaLabel: "-2" })],
          }],
        })}
      />,
    );

    expect(screen.getByText("완제품 A").closest("button")).toBeNull();
  });
});
