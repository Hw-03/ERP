import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createAngle: vi.fn(),
  deleteAngle: vi.fn(),
  getStructure: vi.fn(),
  updateAngle: vi.fn(),
}));

vi.mock("@/lib/api/warehouse-map", () => ({
  warehouseMapApi: {
    createAngle: state.createAngle,
    deleteAngle: state.deleteAngle,
    getStructure: state.getStructure,
    updateAngle: state.updateAngle,
  },
}));

import { AdminWarehouseStructureSection } from "../AdminWarehouseStructureSection";

const structures = [
  {
    id: 1,
    label: "앵글 A",
    angle_type: "angle",
    rows: 4,
    layers: 6,
    jaris_per_cell: 3,
    pos_x: 40,
    pos_y: 40,
    width: 80,
    height: 120,
    display_order: 1,
    is_active: true,
  },
  {
    id: 2,
    label: "통로 A",
    angle_type: "aisle",
    rows: 1,
    layers: 1,
    jaris_per_cell: 1,
    pos_x: 120,
    pos_y: 128,
    width: 240,
    height: 32,
    display_order: 2,
    is_active: true,
  },
  {
    id: 3,
    label: "PL-A",
    angle_type: "pallet",
    rows: 1,
    layers: 1,
    jaris_per_cell: 1,
    pos_x: 560,
    pos_y: 190,
    width: 76,
    height: 48,
    display_order: 3,
    is_active: true,
  },
] as const;

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("AdminWarehouseStructureSection 확인 동작", () => {
  beforeEach(() => {
    state.createAngle.mockReset();
    state.deleteAngle.mockReset();
    state.getStructure.mockReset();
    state.updateAngle.mockReset();
    state.getStructure.mockResolvedValue(structures);
    state.createAngle.mockImplementation(async (payload: { angle_type: string }) => ({
      ...structures[0],
      id: 10,
      label: "추가 구조",
      angle_type: payload.angle_type,
    }));
    state.deleteAngle.mockResolvedValue(undefined);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  it.each([
    ["angle", "앵글 추가", "앵글 2 추가했습니다."],
    ["aisle", "통로 추가", "통로 2 추가했습니다."],
    ["pallet", "PL 추가", "PL-2 추가했습니다."],
  ])("%s 추가는 취소 시 호출하지 않고 확인 후 한 번만 호출한다", async (kind, buttonName, successMessage) => {
    const onStatusChange = vi.fn();
    render(<AdminWarehouseStructureSection onStatusChange={onStatusChange} onError={vi.fn()} />);

    const addButton = await screen.findByRole("button", { name: buttonName, exact: true });
    fireEvent.click(addButton);

    expect(state.createAngle).not.toHaveBeenCalled();
    const firstDialog = screen.getByRole("dialog");
    fireEvent.click(within(firstDialog).getByRole("button", { name: "취소" }));
    expect(state.createAngle).not.toHaveBeenCalled();

    fireEvent.click(addButton);
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "추가" }));

    await waitFor(() => expect(state.createAngle).toHaveBeenCalledOnce());
    expect(state.createAngle).toHaveBeenCalledWith(expect.objectContaining({ angle_type: kind }));
    expect(onStatusChange).toHaveBeenCalledWith(successMessage);
  });

  it.each([
    ["앵글 A", "앵글 삭제", "앵글을 삭제했습니다.", 1],
    ["통로 A", "통로 삭제", "통로를 삭제했습니다.", 2],
    ["PL-A", "PL 삭제", "PL을 삭제했습니다.", 3],
  ])("%s 삭제는 유형별 문구를 쓰고 확인 후 한 번만 호출한다", async (label, buttonName, successMessage, id) => {
    const onStatusChange = vi.fn();
    render(<AdminWarehouseStructureSection onStatusChange={onStatusChange} onError={vi.fn()} />);

    fireEvent.mouseDown(await screen.findByText(label));
    const deleteButton = await screen.findByRole("button", { name: buttonName, exact: true });
    fireEvent.click(deleteButton);

    expect(state.deleteAngle).not.toHaveBeenCalled();
    const firstDialog = screen.getByRole("dialog");
    expect(firstDialog).toHaveTextContent(label);
    fireEvent.click(within(firstDialog).getByRole("button", { name: "취소" }));
    expect(state.deleteAngle).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(state.deleteAngle).toHaveBeenCalledTimes(1));
    expect(state.deleteAngle).toHaveBeenCalledWith(id);
    expect(onStatusChange).toHaveBeenCalledWith(successMessage);
  });
});
