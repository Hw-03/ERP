import { render, screen } from "@testing-library/react";
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
});
