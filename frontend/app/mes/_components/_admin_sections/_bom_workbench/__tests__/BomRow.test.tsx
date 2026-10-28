import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BOMEntry, Item } from "@/lib/api";
import { BomRow } from "../BomRow";

describe("BomRow", () => {
  it("marks a child item that is excluded from automatic BOM inventory movements", () => {
    render(
      <BomRow
        row={{ bom_id: "bom-1", parent_item_id: "parent-1", child_item_id: "child-1", quantity: 1, unit: "EA" } as BOMEntry}
        childItem={{
          item_id: "child-1",
          item_name: "롤 단위 케이블",
          mes_code: "346-HR-0024",
          process_type_code: "HR",
          unit: "EA",
          bom_stock_exempt: true,
        } as Item}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("BOM 재고 미반영")).toBeInTheDocument();
  });

  it("EA 수량 화살표는 1씩 움직이고 직접 입력한 소수 수량은 저장한다", async () => {
    const onSaveQty = vi.fn();

    render(
      <BomRow
        row={{ bom_id: "bom-1", parent_item_id: "parent-1", child_item_id: "child-1", quantity: 1, unit: "EA" } as BOMEntry}
        childItem={{ item_id: "child-1", item_name: "부품", mes_code: "3-AR-0008", unit: "EA" } as Item}
        onSaveQty={onSaveQty}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("클릭하여 수량 수정"));
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("step", "1");

    fireEvent.change(input, { target: { value: "1.25" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(onSaveQty).toHaveBeenCalledWith("bom-1", 1.25);
  });

  it("Enter와 blur가 이어져도 한 번만 저장하고 저장 응답까지 재편집을 막는다", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    const onSaveQty = vi.fn(() => pending);
    render(<BomRow row={{ bom_id: "bom-1", parent_item_id: "parent-1", child_item_id: "child-1", quantity: 1, unit: "EA" } as BOMEntry}
      childItem={{ item_id: "child-1", item_name: "부품", unit: "EA" } as Item}
      onSaveQty={onSaveQty} onRequestDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle("클릭하여 수량 수정"));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onSaveQty).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("클릭하여 수량 수정")).toBeDisabled();
    await act(async () => { resolve(); });
    await waitFor(() => expect(screen.getByTitle("클릭하여 수량 수정")).toBeEnabled());
  });
});
