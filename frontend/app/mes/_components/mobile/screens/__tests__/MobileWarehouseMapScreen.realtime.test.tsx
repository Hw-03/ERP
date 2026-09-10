import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WarehouseMap } from "@/lib/api/warehouse-map";
import { MobileWarehouseMapScreen } from "../MobileWarehouseMapScreen";

const mocks = vi.hoisted(() => ({
  revision: 1 as number | null,
  getMap: vi.fn(),
  getBoxTracking: vi.fn(),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

vi.mock("@/lib/api/warehouse-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/warehouse-map")>("@/lib/api/warehouse-map");
  return {
    ...actual,
    warehouseMapApi: {
      ...actual.warehouseMapApi,
      getMap: mocks.getMap,
      getBoxTracking: mocks.getBoxTracking,
    },
  };
});

vi.mock("../../../_warehouse_map_sections/WarehouseStages", () => ({
  FloorStage: ({ angles, onAngleClick }: {
    angles: Array<{ label: string }>;
    onAngleClick: (angle: { label: string }) => void;
  }) => (
    <button type="button" data-testid="mobile-map-floor" onClick={() => onAngleClick(angles[0])}>
      {angles.map((angle) => angle.label).join(",")}
    </button>
  ),
  FrontStage: ({ cellIndex }: { cellIndex: Map<string, unknown> }) => (
    <div data-testid="mobile-map-front">boxes:{cellIndex.size}</div>
  ),
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
  unplaced_items: [],
};

beforeEach(() => {
  mocks.revision = 1;
  mocks.getMap.mockReset().mockResolvedValue(mapFixture);
  mocks.getBoxTracking.mockReset().mockResolvedValue({ enabled: true });
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

  it("hides box placement details when the UI display preference is disabled", async () => {
    mocks.getMap.mockResolvedValue({
      ...mapFixture,
      boxes: [{
        box_id: "mobile-hidden-box",
        angle_id: 1,
        row_no: 1,
        layer_no: 1,
        jari_index: 0,
        size: "SMALL",
        stack_order: 0,
        items: [],
      }],
    });
    mocks.getBoxTracking.mockResolvedValue({ enabled: false });

    render(<MobileWarehouseMapScreen onExit={vi.fn()} />);

    fireEvent.click(await screen.findByTestId("mobile-map-floor"));
    expect(await screen.findByTestId("mobile-map-front")).toHaveTextContent("boxes:0");
  });
});
