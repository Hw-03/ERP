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
    label: "조립 생산",
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
    composition: null,
    ...overrides,
  };
}

describe("HistoryKeyPointSummary", () => {
  it("renders each key point once without repeating the panel header target or stale stock", () => {
    render(<HistoryKeyPointSummary summary={summary()} />);

    expect(screen.getAllByText("생산")).toHaveLength(1);
    expect(screen.getAllByText("완료")).toHaveLength(1);
    expect(screen.getAllByText("요청자 A")).toHaveLength(1);
    expect(screen.getByText("실제 영향")).toBeInTheDocument();
    expect(screen.getByText("조립 생산")).toBeInTheDocument();
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

    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.getByText("부품")).toBeInTheDocument();
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
    expect(screen.getByText((_, element) => (
      element?.textContent === "R-001 · 조립 생산 · BOM 4 EA"
    ))).toBeInTheDocument();
  });

  it("keeps partial impacts hidden while the complete scope is loading or failed", () => {
    const onRetryImpact = vi.fn();
    const { rerender } = render(
      <HistoryKeyPointSummary
        summary={summary({ impactGroups: [] })}
        impactStatus="loading"
      />,
    );

    expect(screen.getByText("실제 영향 불러오는 중")).toBeInTheDocument();

    rerender(
      <HistoryKeyPointSummary
        summary={summary({ impactGroups: [] })}
        impactStatus="error"
        onRetryImpact={onRetryImpact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "실제 영향 다시 불러오기" }));
    expect(onRetryImpact).toHaveBeenCalledOnce();
  });

  it("makes a BOM-backed actual impact focusable from the summary", () => {
    const onImpactClick = vi.fn();
    render(
      <HistoryKeyPointSummary
        summary={summary({
          impactGroups: [{
            key: "actual",
            label: null,
            effects: [effect({ role: "부품", delta: -2, deltaLabel: "-2" })],
          }],
        })}
        onImpactClick={onImpactClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /완제품 A.*-2 EA/ }));
    expect(onImpactClick).toHaveBeenCalledWith(expect.objectContaining({ itemId: "item-finished" }));
  });
});
