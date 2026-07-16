import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InventoryEffectRow } from "../historyInventoryEffect";
import type { HistoryDetailSummary } from "../historyDetailSummary";
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
    requester: { name: "요청자 A", at: "2026-07-10T01:00:00Z" },
    flow: null,
    composition: null,
    impactIdentity: "log-1",
    ...overrides,
  };
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

    const output = screen.getByRole("button", { name: /완제품.*1품목.*\+2 EA/ });
    const components = screen.getByRole("button", { name: /부품.*2품목.*-5 EA/ });
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

    const warehouse = screen.getByRole("button", { name: /창고 재고.*1품목.*-10 EA/ });
    const outbound = screen.getByRole("button", { name: /출하 재고.*1품목.*\+10 EA/ });
    expect(warehouse).toHaveAttribute("aria-expanded", "false");
    expect(outbound).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("출하 품목")).not.toBeInTheDocument();

    fireEvent.click(outbound);
    expect(outbound).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("출하 품목")).toBeInTheDocument();
    expect(warehouse).toHaveAttribute("aria-expanded", "false");
  });

  it("does not truncate the requester timestamp", () => {
    render(<HistoryKeyPointSummary summary={summary()} />);

    const timestamp = screen.getByText(/2026년 7월 10일/);
    expect(timestamp).not.toHaveClass("truncate");
    expect(timestamp).toHaveClass("whitespace-nowrap");
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
