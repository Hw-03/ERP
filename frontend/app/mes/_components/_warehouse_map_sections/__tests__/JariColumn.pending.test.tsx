import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WarehouseBox } from "@/lib/api/warehouse-map";
import { JariColumn } from "../JariColumn";

const boxes: WarehouseBox[] = [
  {
    box_id: "box-pending",
    angle_id: 1,
    row_no: 1,
    layer_no: 1,
    jari_index: 0,
    size: "SMALL",
    stack_order: 0,
    items: [],
  },
  {
    box_id: "box-ready",
    angle_id: 1,
    row_no: 1,
    layer_no: 1,
    jari_index: 0,
    size: "SMALL",
    stack_order: 1,
    items: [],
  },
];

describe("JariColumn pending mutation state", () => {
  it("marks the pending box and blocks only its drag start", () => {
    const onBoxDragStart = vi.fn();
    const { container } = render(
      <JariColumn
        boxes={boxes}
        scale="row"
        draggable
        pendingBoxIds={new Set(["box-pending"])}
        onBoxDragStart={onBoxDragStart}
      />,
    );

    const pending = container.querySelector<HTMLElement>('[data-box-id="box-pending"]');
    const ready = container.querySelector<HTMLElement>('[data-box-id="box-ready"]');
    expect(pending).toHaveAttribute("data-pending", "true");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).not.toHaveAttribute("draggable", "true");
    expect(ready).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(pending!);
    fireEvent.dragStart(ready!);

    expect(onBoxDragStart).toHaveBeenCalledTimes(1);
    expect(onBoxDragStart).toHaveBeenCalledWith("box-ready");
  });
});
