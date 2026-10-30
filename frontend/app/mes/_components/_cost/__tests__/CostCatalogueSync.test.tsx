import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { itemsApi } from "@/lib/api/items";
import { invalidateOperationalQueries } from "@/lib/queries/realtime";
import { invalidateCostQueries } from "@/lib/queries/costInvalidation";
import { CostAnalysisWorkspace } from "../CostAnalysisWorkspace";

vi.mock("@/lib/api/items", () => ({ itemsApi: { getItems: vi.fn() } }));
vi.mock("@/lib/queries/useModelsQuery", () => ({ useModelsQuery: () => ({ data: [] }) }));
vi.mock("@/lib/queries/useCostQuery", () => ({
  useCostActor: () => ({ employee_id: "actor", token: "session" }),
  useCostQuery: () => ({ data: undefined }),
  useCostSummaryQueries: () => [],
}));

const item = { item_id: "a", item_name: "이전 품목", mes_code: "8-TR", process_type_code: "TR", locations: [], model_slots: [] } as unknown as Item;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.mocked(itemsApi.getItems).mockReset();
});

it("열린 원가 목록은 실시간 품목 변경과 수동 원가 갱신 후 이름·추가·삭제를 반영한다", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(itemsApi.getItems).mockResolvedValueOnce([item]);
  const view = render(<QueryClientProvider client={client}><CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} /></QueryClientProvider>);
  try {
    await screen.findByRole("button", { name: "이전 품목 8-TR 원가 분석" });
    vi.mocked(itemsApi.getItems).mockResolvedValue([{ ...item, item_name: "변경 품목" }, { ...item, item_id: "b", item_name: "신규 품목" }]);
    await act(async () => { await invalidateOperationalQueries(client, undefined, 1); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "이전 품목 8-TR 원가 분석" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "변경 품목 8-TR 원가 분석" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신규 품목 8-TR 원가 분석" })).toBeInTheDocument();
    vi.mocked(itemsApi.getItems).mockResolvedValue([]);
    await act(async () => { await invalidateCostQueries(client); });
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
  } finally {
    view.unmount();
    client.clear();
    vi.unstubAllGlobals();
  }
});
