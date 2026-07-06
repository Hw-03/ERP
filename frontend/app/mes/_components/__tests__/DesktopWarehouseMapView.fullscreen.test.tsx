import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DesktopWarehouseMapView } from "../DesktopWarehouseMapView";

const mapApiMock = vi.hoisted(() => ({
  getMap: vi.fn(),
}));

vi.mock("@/lib/api/warehouse-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/warehouse-map")>("@/lib/api/warehouse-map");
  return {
    ...actual,
    warehouseMapApi: {
      ...actual.warehouseMapApi,
      getMap: mapApiMock.getMap,
    },
  };
});

const mapFixture = {
  angles: [
    {
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
    },
  ],
  boxes: [],
  special_zones: [],
};

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("DesktopWarehouseMapView fullscreen", () => {
  it("keeps search chrome in regular mode", async () => {
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    renderWithClient(<DesktopWarehouseMapView />);

    expect(await screen.findByText("앵글 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/품목명.*코드 검색/)).toBeInTheDocument();
  });

  it("removes map chrome in fullscreen and exits on Escape", async () => {
    const onFullscreenChange = vi.fn();
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    renderWithClient(<DesktopWarehouseMapView fullscreen onFullscreenChange={onFullscreenChange} />);

    expect(await screen.findByText("앵글 1")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/품목명.*코드 검색/)).toBeNull();

    const card = screen.getByTestId("warehouse-map-card");
    const cardStyle = card.getAttribute("style") ?? "";
    expect(cardStyle).toContain("border-radius: 0");
    expect(cardStyle).toContain("box-shadow: none");
    expect(cardStyle).toContain("background-image: none");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onFullscreenChange).toHaveBeenCalledWith(false));
  });

  it("does not run the stage enter animation on the initial tab mount", async () => {
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    const { container } = renderWithClient(<DesktopWarehouseMapView />);

    expect(await screen.findByText("앵글 1")).toBeInTheDocument();
    expect(container.querySelector('[class*="stageEnter"]')).toBeNull();

    fireEvent.click(screen.getByText("앵글 1"));

    expect(container.querySelector('[class*="stageEnter"]')).not.toBeNull();
  });
});
