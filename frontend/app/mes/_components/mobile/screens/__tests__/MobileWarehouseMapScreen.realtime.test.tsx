import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WarehouseMap } from "@/lib/api/warehouse-map";
import { MobileWarehouseMapScreen } from "../MobileWarehouseMapScreen";

const mocks = vi.hoisted(() => ({
  revision: 1 as number | null,
  getMap: vi.fn(),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

vi.mock("@/lib/api/warehouse-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/warehouse-map")>("@/lib/api/warehouse-map");
  return {
    ...actual,
    warehouseMapApi: { ...actual.warehouseMapApi, getMap: mocks.getMap },
  };
});

vi.mock("../../../_warehouse_map_sections/WarehouseStages", () => ({
  FloorStage: ({ angles }: { angles: Array<{ label: string }> }) => (
    <div data-testid="mobile-map-floor">{angles.map((angle) => angle.label).join(",")}</div>
  ),
  FrontStage: () => <div>front</div>,
}));

vi.mock("../../../_warehouse_map_sections/WarehouseJariPanel", () => ({
  WarehouseJariPanel: () => <div>detail</div>,
}));

const mapFixture: WarehouseMap = {
  angles: [{
    id: 1,
    label: "앵글 1",
    angle_type: "angle",
    rows: 1,
    layers: 1,
    jaris_per_cell: 1,
    pos_x: 20,
    pos_y: 20,
    width: 120,
    height: 80,
    display_order: 1,
    is_active: true,
  }],
  boxes: [],
  special_zones: [],
};

beforeEach(() => {
  mocks.revision = 1;
  mocks.getMap.mockReset().mockResolvedValue(mapFixture);
});

describe("MobileWarehouseMapScreen realtime refresh", () => {
  it("keeps the current map visible after refresh failure and retries in place", async () => {
    const props = { onExit: vi.fn() };
    const { rerender } = render(<MobileWarehouseMapScreen {...props} />);
    expect(await screen.findByTestId("mobile-map-floor")).toHaveTextContent("앵글 1");

    mocks.getMap.mockRejectedValueOnce(new Error("refresh failed"));
    mocks.revision = 2;
    rerender(<MobileWarehouseMapScreen {...props} />);

    expect(await screen.findByRole("button", { name: "다시 동기화" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-map-floor")).toHaveTextContent("앵글 1");

    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 동기화" })).not.toBeInTheDocument());
    expect(screen.getByTestId("mobile-map-floor")).toHaveTextContent("앵글 1");
  });
});
