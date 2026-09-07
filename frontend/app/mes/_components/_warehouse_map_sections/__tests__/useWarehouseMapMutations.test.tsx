import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WarehouseBox, WarehouseMap } from "@/lib/api/warehouse-map";
import { queryKeys } from "@/lib/queries/keys";
import { useWarehouseMapQuery } from "@/lib/queries/useWarehouseMapQuery";
import { useWarehouseMapMutations } from "../useWarehouseMapMutations";

const mapApiMock = vi.hoisted(() => ({
  getMap: vi.fn(),
  moveBox: vi.fn(),
  restackJari: vi.fn(),
}));

vi.mock("@/lib/api/warehouse-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/warehouse-map")>("@/lib/api/warehouse-map");
  return {
    ...actual,
    warehouseMapApi: {
      ...actual.warehouseMapApi,
      getMap: mapApiMock.getMap,
      moveBox: mapApiMock.moveBox,
      restackJari: mapApiMock.restackJari,
    },
  };
});

function box(boxId: string, jariIndex: number, stackOrder = 0): WarehouseBox {
  return {
    box_id: boxId,
    angle_id: 1,
    row_no: 1,
    layer_no: 1,
    jari_index: jariIndex,
    size: "SMALL",
    stack_order: stackOrder,
    items: [{
      item_id: `item-${boxId}`,
      item_name: boxId,
      mes_code: boxId.toUpperCase(),
      quantity: 1,
      department: null,
      color_hex: null,
    }],
  };
}

const initialMap: WarehouseMap = {
  angles: [{
    id: 1,
    label: "앵글 1",
    angle_type: "angle",
    rows: 1,
    layers: 1,
    jaris_per_cell: 4,
    pos_x: 0,
    pos_y: 0,
    width: 100,
    height: 100,
    display_order: 1,
    is_active: true,
  }],
  boxes: [box("box-a", 0), box("box-b", 1), box("box-c", 2)],
  special_zones: [],
  unplaced_items: [],
};

function mapWithPositions(positions: Record<string, { jari: number; order?: number }>): WarehouseMap {
  return {
    ...initialMap,
    boxes: initialMap.boxes.map((candidate) => {
      const position = positions[candidate.box_id];
      return position
        ? { ...candidate, jari_index: position.jari, stack_order: position.order ?? 0 }
        : candidate;
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function positions(map: WarehouseMap | undefined): string {
  return [...(map?.boxes ?? [])]
    .sort((left, right) => left.box_id.localeCompare(right.box_id))
    .map((candidate) => `${candidate.box_id}:${candidate.jari_index}:${candidate.stack_order}`)
    .join("|");
}

function MutationHarness({ onStatusChange }: { onStatusChange?: (message: string) => void }) {
  const mutations = useWarehouseMapMutations({ onStatusChange });
  const mapQuery = useWarehouseMapQuery({ enabled: !mutations.hasPending });

  return (
    <>
      <output data-testid="map-positions">{positions(mapQuery.data)}</output>
      <output data-testid="pending-boxes">{Array.from(mutations.pendingBoxIds).sort().join(",")}</output>
      <button type="button" onClick={() => void mutations.moveBox("box-a", { angleId: 1, row: 1, layer: 1, jari: 2 })}>move-a</button>
      <button type="button" onClick={() => void mutations.moveBox("box-b", { angleId: 1, row: 1, layer: 1, jari: 3 })}>move-b</button>
      <button type="button" onClick={() => void mutations.moveBox("box-b", { angleId: 1, row: 1, layer: 1, jari: 2 })}>move-b-to-restack</button>
      <button type="button" onClick={() => void mutations.moveBox("box-c", { angleId: 1, row: 1, layer: 1, jari: 3 })}>move-c</button>
      <button
        type="button"
        onClick={() => void mutations.insertBox("box-a", {
          angleId: 1,
          row: 1,
          layer: 1,
          jari: 2,
          targetBoxId: "box-c",
          place: "above",
        })}
      >
        restack-a-on-c
      </button>
    </>
  );
}

function renderHarness({
  client = makeClient(),
  onStatusChange,
}: {
  client?: QueryClient;
  onStatusChange?: (message: string) => void;
} = {}) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<MutationHarness onStatusChange={onStatusChange} />, { wrapper: Wrapper }) };
}

async function expectInitialMap(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent(
    "box-a:0:0|box-b:1:0|box-c:2:0",
  ));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useWarehouseMapMutations", () => {
  it("keeps B success when B settles before A failure and refetches once after both settle", async () => {
    const moveA = deferred<WarehouseBox>();
    const moveB = deferred<WarehouseBox>();
    const finalMap = mapWithPositions({ "box-a": { jari: 0 }, "box-b": { jari: 3 } });
    const onStatusChange = vi.fn();
    mapApiMock.getMap.mockResolvedValueOnce(initialMap).mockResolvedValueOnce(finalMap);
    mapApiMock.moveBox.mockImplementation((boxId: string) => boxId === "box-a" ? moveA.promise : moveB.promise);
    renderHarness({ onStatusChange });
    await expectInitialMap();

    fireEvent.click(screen.getByRole("button", { name: "move-a" }));
    fireEvent.click(screen.getByRole("button", { name: "move-b" }));
    await waitFor(() => expect(mapApiMock.moveBox).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("pending-boxes")).toHaveTextContent("box-a,box-b");

    await act(async () => {
      moveB.resolve(box("box-b", 3));
      await moveB.promise;
    });
    expect(mapApiMock.getMap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("map-positions")).toHaveTextContent("box-a:2:1|box-b:3:1");

    await act(async () => {
      moveA.reject(new Error("A 이동 실패"));
      await Promise.resolve();
    });

    await waitFor(() => expect(mapApiMock.getMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent(
      "box-a:0:0|box-b:3:0|box-c:2:0",
    ));
    expect(onStatusChange).toHaveBeenCalledWith("A 이동 실패");
    expect(screen.getByTestId("pending-boxes")).toBeEmptyDOMElement();
  });

  it("keeps B optimistic success when A fails before B settles and refetches once", async () => {
    const moveA = deferred<WarehouseBox>();
    const moveB = deferred<WarehouseBox>();
    const finalMap = mapWithPositions({ "box-a": { jari: 0 }, "box-b": { jari: 3 } });
    mapApiMock.getMap.mockResolvedValueOnce(initialMap).mockResolvedValueOnce(finalMap);
    mapApiMock.moveBox.mockImplementation((boxId: string) => boxId === "box-a" ? moveA.promise : moveB.promise);
    renderHarness();
    await expectInitialMap();

    fireEvent.click(screen.getByRole("button", { name: "move-a" }));
    fireEvent.click(screen.getByRole("button", { name: "move-b" }));
    await waitFor(() => expect(mapApiMock.moveBox).toHaveBeenCalledTimes(2));

    await act(async () => {
      moveA.reject(new Error("A 이동 실패"));
      await Promise.resolve();
    });
    expect(mapApiMock.getMap).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent(
      "box-a:0:0|box-b:3:1",
    ));

    await act(async () => {
      moveB.resolve(box("box-b", 3));
      await moveB.promise;
    });

    await waitFor(() => expect(mapApiMock.getMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent(
      "box-a:0:0|box-b:3:0|box-c:2:0",
    ));
    expect(screen.getByTestId("pending-boxes")).toBeEmptyDOMElement();
  });

  it("keeps A success when B fails and replaces both optimistic positions from the server", async () => {
    const moveA = deferred<WarehouseBox>();
    const moveB = deferred<WarehouseBox>();
    const finalMap = mapWithPositions({ "box-a": { jari: 2, order: 1 }, "box-b": { jari: 1 } });
    const onStatusChange = vi.fn();
    mapApiMock.getMap.mockResolvedValueOnce(initialMap).mockResolvedValueOnce(finalMap);
    mapApiMock.moveBox.mockImplementation((boxId: string) => boxId === "box-a" ? moveA.promise : moveB.promise);
    renderHarness({ onStatusChange });
    await expectInitialMap();

    fireEvent.click(screen.getByRole("button", { name: "move-a" }));
    fireEvent.click(screen.getByRole("button", { name: "move-b" }));
    await waitFor(() => expect(mapApiMock.moveBox).toHaveBeenCalledTimes(2));

    await act(async () => {
      moveA.resolve(box("box-a", 2, 1));
      await moveA.promise;
    });
    expect(mapApiMock.getMap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("map-positions")).toHaveTextContent("box-a:2:1|box-b:3:1");

    await act(async () => {
      moveB.reject(new Error("B 이동 실패"));
      await Promise.resolve();
    });

    await waitFor(() => expect(mapApiMock.getMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent(
      "box-a:2:1|box-b:1:0|box-c:2:0",
    ));
    expect(onStatusChange).toHaveBeenCalledWith("B 이동 실패");
  });

  it("locks every restacked box and both affected slots until server convergence", async () => {
    const restack = deferred<WarehouseBox[]>();
    const onStatusChange = vi.fn();
    const restackedMap = mapWithPositions({
      "box-a": { jari: 2, order: 1 },
      "box-c": { jari: 2, order: 0 },
    });
    const movedMap = mapWithPositions({
      "box-a": { jari: 2, order: 0 },
      "box-c": { jari: 3, order: 0 },
    });
    mapApiMock.getMap
      .mockResolvedValueOnce(initialMap)
      .mockResolvedValueOnce(restackedMap)
      .mockResolvedValueOnce(movedMap);
    mapApiMock.restackJari.mockReturnValue(restack.promise);
    mapApiMock.moveBox.mockResolvedValue(box("box-c", 3));
    renderHarness({ onStatusChange });
    await expectInitialMap();

    fireEvent.click(screen.getByRole("button", { name: "restack-a-on-c" }));
    await waitFor(() => expect(mapApiMock.restackJari).toHaveBeenCalledWith({
      angle_id: 1,
      row_no: 1,
      layer_no: 1,
      jari_index: 2,
      box_ids: ["box-c", "box-a"],
    }));
    expect(screen.getByTestId("pending-boxes")).toHaveTextContent("box-a,box-c");

    fireEvent.click(screen.getByRole("button", { name: "move-c" }));
    fireEvent.click(screen.getByRole("button", { name: "move-b-to-restack" }));
    fireEvent.click(screen.getByRole("button", { name: "restack-a-on-c" }));
    expect(mapApiMock.moveBox).not.toHaveBeenCalled();
    expect(mapApiMock.restackJari).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledTimes(3);
    expect(onStatusChange).toHaveBeenLastCalledWith("해당 박스나 자리를 다른 이동이 처리 중입니다.");

    await act(async () => {
      restack.resolve([box("box-c", 2), box("box-a", 2, 1)]);
      await restack.promise;
    });
    await waitFor(() => expect(screen.getByTestId("pending-boxes")).toBeEmptyDOMElement());
    expect(mapApiMock.getMap).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "move-c" }));
    await waitFor(() => expect(mapApiMock.moveBox).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mapApiMock.getMap).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("map-positions")).toHaveTextContent(
      "box-a:2:0|box-b:1:0|box-c:3:0",
    );
  });

  it("keeps pending ownership and optimistic cache across unmount and converges after remount", async () => {
    const moveA = deferred<WarehouseBox>();
    const finalMap = mapWithPositions({ "box-a": { jari: 2, order: 1 } });
    const client = makeClient();
    mapApiMock.getMap.mockResolvedValueOnce(initialMap).mockResolvedValueOnce(finalMap);
    mapApiMock.moveBox.mockReturnValue(moveA.promise);
    const first = renderHarness({ client });
    await expectInitialMap();

    fireEvent.click(screen.getByRole("button", { name: "move-a" }));
    await waitFor(() => expect(mapApiMock.moveBox).toHaveBeenCalledTimes(1));
    expect(positions(client.getQueryData<WarehouseMap>(queryKeys.warehouseMap.map()))).toContain("box-a:2:1");
    first.unmount();

    renderHarness({ client });
    expect(mapApiMock.getMap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pending-boxes")).toHaveTextContent("box-a");
    expect(screen.getByTestId("map-positions")).toHaveTextContent("box-a:2:1");
    fireEvent.click(screen.getByRole("button", { name: "move-a" }));
    expect(mapApiMock.moveBox).toHaveBeenCalledTimes(1);

    await act(async () => {
      moveA.resolve(box("box-a", 2, 1));
      await moveA.promise;
    });

    await waitFor(() => expect(mapApiMock.getMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("map-positions")).toHaveTextContent("box-a:2:1"));
    expect(screen.getByTestId("pending-boxes")).toBeEmptyDOMElement();
  });
});
