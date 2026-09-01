import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { WarehouseMap } from "@/lib/api/warehouse-map";
import { DesktopWarehouseMapView } from "../DesktopWarehouseMapView";

const mapApiMock = vi.hoisted(() => ({
  getMap: vi.fn(),
  getBoxTracking: vi.fn(() => Promise.resolve({ enabled: true })),
}));

vi.mock("@/lib/api/warehouse-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/warehouse-map")>("@/lib/api/warehouse-map");
  return {
    ...actual,
    warehouseMapApi: {
      ...actual.warehouseMapApi,
      getMap: mapApiMock.getMap,
      getBoxTracking: mapApiMock.getBoxTracking,
    },
  };
});

const mapFixture: WarehouseMap = {
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
  unplaced_items: [],
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
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe("DesktopWarehouseMapView fullscreen", () => {
  it("keeps the current map visible when a background refresh fails and retries in place", async () => {
    mapApiMock.getMap.mockReset().mockResolvedValueOnce(mapFixture).mockRejectedValue(new Error("refresh failed"));
    const { client } = renderWithClient(<DesktopWarehouseMapView />);
    expect(await screen.findByText("앵글 1")).toBeInTheDocument();

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["warehouseMap", "map"] });
    });

    expect(screen.getByText("앵글 1")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "다시 동기화" })).toBeInTheDocument();

    mapApiMock.getMap.mockResolvedValue(mapFixture);
    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 동기화" })).not.toBeInTheDocument());
  });

  it("keeps search chrome in regular mode", async () => {
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    renderWithClient(<DesktopWarehouseMapView />);

    expect(await screen.findByText("앵글 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/품목명.*코드 검색/)).toBeInTheDocument();
  });

  it("hides box placement details when the UI display preference is disabled", async () => {
    const mapWithBox: WarehouseMap = {
      ...mapFixture,
      boxes: [{
        box_id: "hidden-box",
        angle_id: 1,
        row_no: 1,
        layer_no: 1,
        jari_index: 0,
        size: "SMALL",
        stack_order: 0,
        items: [{
          item_id: "hidden-item",
          item_name: "숨김 품목",
          mes_code: "HIDDEN-1",
          quantity: 1,
          department: null,
          color_hex: null,
        }],
      }],
    };
    mapApiMock.getMap.mockResolvedValueOnce(mapWithBox);
    mapApiMock.getBoxTracking.mockResolvedValueOnce({ enabled: false });

    renderWithClient(<DesktopWarehouseMapView />);

    await screen.findByText("앵글 1");
    await waitFor(() => expect(mapApiMock.getBoxTracking).toHaveBeenCalled());
    const search = screen.getByPlaceholderText(/품목명.*코드 검색/);
    fireEvent.change(search, { target: { value: "숨김 품목" } });
    expect(await screen.findByText(/위치를 찾을 수 없습니다/)).toBeInTheDocument();
  });

  it("uses a rounded flat surface in regular mode", async () => {
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    renderWithClient(<DesktopWarehouseMapView />);

    await screen.findByTestId("warehouse-map-card");
    const cardStyle = screen.getByTestId("warehouse-map-card").getAttribute("style") ?? "";
    expect(cardStyle).toContain("border-radius: 24px");
    expect(cardStyle).toContain("box-shadow: none");
    expect(cardStyle).toContain("background-image: none");
  });

  it("places the fullscreen control inside the regular map header", async () => {
    const onFullscreenChange = vi.fn();
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);

    renderWithClient(<DesktopWarehouseMapView onFullscreenChange={onFullscreenChange} />);

    expect(await screen.findByText("앵글 1")).toBeInTheDocument();
    const control = screen.getByTestId("warehouse-map-fullscreen-button");
    expect(screen.getByTestId("warehouse-map-card")).toContainElement(control);

    fireEvent.click(control);
    expect(onFullscreenChange).toHaveBeenCalledWith(true);
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

  it("reconnects the selected search result to refreshed map objects without resetting navigation", async () => {
    const initialMap: WarehouseMap = {
      ...mapFixture,
      boxes: [{
        box_id: "box-1",
        angle_id: 1,
        row_no: 1,
        layer_no: 1,
        jari_index: 0,
        size: "SMALL",
        stack_order: 0,
        items: [{
          item_id: "item-1",
          item_name: "검색 품목",
          mes_code: "M-1",
          quantity: 2,
          department: null,
          color_hex: null,
        }],
      }],
    };
    const refreshedMap: WarehouseMap = {
      ...initialMap,
      angles: [{ ...initialMap.angles[0], label: "앵글 최신" }],
      boxes: [{
        ...initialMap.boxes[0],
        items: [{
          ...initialMap.boxes[0].items[0],
          item_name: "검색 품목 최신",
          quantity: 7,
        }],
      }],
    };
    mapApiMock.getMap.mockResolvedValueOnce(initialMap);
    const { client } = renderWithClient(<DesktopWarehouseMapView />);

    await screen.findByText("앵글 1");
    const search = await screen.findByPlaceholderText(/품목명.*코드 검색/);
    fireEvent.change(search, { target: { value: "검색 품목" } });
    expect(await screen.findByRole("button", { name: /앵글 1.*×2/ })).toBeInTheDocument();
    expect(screen.getAllByText("A열", { exact: true }).length).toBeGreaterThan(0);

    client.setQueryData(["warehouseMap", "map"], refreshedMap);

    expect(await screen.findByRole("button", { name: /앵글 최신.*×7/ })).toBeInTheDocument();
    expect(screen.getByText(/검색 품목 최신.*M-1/)).toBeInTheDocument();
    expect(search).toHaveValue("검색 품목");
    expect(screen.getAllByText("A열", { exact: true }).length).toBeGreaterThan(0);
  });

  it("reconnects an open angle and cell panel to refreshed map objects", async () => {
    const refreshedMap: WarehouseMap = {
      ...mapFixture,
      angles: [{ ...mapFixture.angles[0], label: "앵글 최신" }],
    };
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);
    const { client } = renderWithClient(<DesktopWarehouseMapView />);

    fireEvent.click(await screen.findByText("앵글 1"));
    fireEvent.click(await screen.findByTitle("A열 1층"));
    expect(await screen.findByText("앵글 1 · A열 · 1층")).toBeInTheDocument();

    client.setQueryData(["warehouseMap", "map"], refreshedMap);

    expect(await screen.findByText("앵글 최신 · A열 · 1층")).toBeInTheDocument();
    expect(screen.queryByText("앵글 1 · A열 · 1층")).not.toBeInTheDocument();
  });

  it("closes an open box editor when refreshed map data arrives", async () => {
    const refreshedMap: WarehouseMap = {
      ...mapFixture,
      angles: [{ ...mapFixture.angles[0], label: "앵글 최신" }],
    };
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);
    const { client } = renderWithClient(<DesktopWarehouseMapView editable items={[]} />);

    fireEvent.click(await screen.findByText("앵글 1"));
    fireEvent.click(await screen.findByTitle("A열 1층"));
    fireEvent.click(await screen.findByRole("button", { name: "박스 넣기" }));
    expect(await screen.findByText("자리 1 — 박스 넣기")).toBeInTheDocument();

    client.setQueryData(["warehouseMap", "map"], refreshedMap);

    await waitFor(() => expect(screen.queryByText("자리 1 — 박스 넣기")).not.toBeInTheDocument());
    expect(screen.getByText("앵글 최신 · A열 · 1층")).toBeInTheDocument();
  });

  it("closes an invalid cell panel and clamps its row after the map shrinks", async () => {
    const expandedMap: WarehouseMap = {
      ...mapFixture,
      angles: [{ ...mapFixture.angles[0], rows: 2, layers: 2 }],
    };
    mapApiMock.getMap.mockResolvedValueOnce(expandedMap);
    const { client } = renderWithClient(<DesktopWarehouseMapView />);

    fireEvent.click(await screen.findByText("앵글 1"));
    fireEvent.click(await screen.findByTitle("B열 2층"));
    expect(await screen.findByText("앵글 1 · B열 · 2층")).toBeInTheDocument();

    client.setQueryData(["warehouseMap", "map"], mapFixture);

    await waitFor(() => expect(screen.queryByText("앵글 1 · B열 · 2층")).not.toBeInTheDocument());
    expect(screen.getAllByText("A열", { exact: true }).length).toBeGreaterThan(0);
  });

  it("returns to the floor when the open angle is removed", async () => {
    const withoutAngles: WarehouseMap = {
      ...mapFixture,
      angles: [],
    };
    const replaceState = vi.spyOn(window.history, "replaceState");
    mapApiMock.getMap.mockResolvedValueOnce(mapFixture);
    const { client } = renderWithClient(<DesktopWarehouseMapView />);

    fireEvent.click(await screen.findByText("앵글 1"));
    expect(screen.getByText("앵글 1", { exact: true })).toBeInTheDocument();

    client.setQueryData(["warehouseMap", "map"], withoutAngles);

    await waitFor(() => expect(screen.queryByText("앵글 1", { exact: true })).not.toBeInTheDocument());
    expect(screen.getByText("▼ 입구", { exact: true })).toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith({ wmDepth: 0 }, "");
    replaceState.mockRestore();
  });

  it("falls back to the floor when browser history points to a removed angle", async () => {
    const mapWithSecondAngle: WarehouseMap = {
      ...mapFixture,
      angles: [
        ...mapFixture.angles,
        { ...mapFixture.angles[0], id: 2, label: "앵글 2", pos_x: 160 },
      ],
    };
    mapApiMock.getMap.mockResolvedValueOnce(mapWithSecondAngle);
    renderWithClient(<DesktopWarehouseMapView />);

    fireEvent.click(await screen.findByText("앵글 2"));
    expect(screen.queryByText("▼ 입구", { exact: true })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", {
        state: { wm: { stage: "row", angleId: 999, row: 1 }, wmDepth: 1 },
      }));
    });

    expect(await screen.findByText("▼ 입구", { exact: true })).toBeInTheDocument();
  });
});
