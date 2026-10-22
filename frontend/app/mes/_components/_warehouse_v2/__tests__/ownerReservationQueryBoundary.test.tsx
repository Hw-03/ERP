// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch, type IoLine, type Item } from "@/lib/api";
import { itemsApi } from "@/lib/api/items";
import { queryKeys } from "@/lib/queries/keys";
import { invalidateWorkReservationQueries } from "@/lib/queries/workReservationInvalidation";
import { useWarehouseData } from "../../_warehouse_hooks/useWarehouseData";
import { IoComposeView } from "../IoComposeView";
import { MobileIoComposeWizard } from "../../mobile/warehouse/MobileIoComposeWizard";

vi.mock("next/navigation", () => ({ usePathname: () => "/mes", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams("tab=warehouse&section=compose&step=4") }));
vi.mock("@/lib/api", () => ({ api: { getItems: vi.fn(), getBatch: vi.fn(), saveDraft: vi.fn() } }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
vi.mock("@/lib/queries/useBomQuery", () => ({ useBomListQuery: () => ({ data: [], isSuccess: true, isPending: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/lib/queries/useModelsQuery", () => ({ useModelsQuery: () => ({ data: [], error: null }) }));
vi.mock("@/lib/queries/useEmployeesQuery", () => ({ useEmployeesQuery: () => ({ data: [], error: null }) }));
vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen: vi.fn() }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));
vi.mock("../IoTargetPicker", () => ({ IoTargetPicker: () => null }));
vi.mock("../IoConfirmStep", () => ({ IoConfirmStep: () => null }));

const item = { item_id: "material", item_name: "예약 자재", mes_code: "MATERIAL", unit: "EA", quantity: 10, warehouse_qty: 10, pending_quantity: 3, locations: [] } as unknown as Item;
const line = { line_id: "line", item_id: "material", item_name: item.item_name, mes_code: item.mes_code, unit: "EA", quantity: 3, included: true, origin: "manual",
  from_bucket: "warehouse", from_department: null, to_bucket: "production", to_department: "조립", direction: "move", shortage: 0 } as IoLine;
const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved", work_type: "warehouse_io", sub_type: "warehouse_to_dept", to_department: "조립",
  bundles: [{ bundle_id: "bundle", source_kind: "direct_item", source_item_id: "material", title: item.item_name, quantity: 3, lines: [line] }],
  effective_plan: { effects: [{ item_id: "material", kind: "move", quantity: 3, from: { bucket: "warehouse", department: null } }] } } as IoBatch;
const saved = { ...draft, revision: 8, effective_plan: { ...draft.effective_plan!, effects: [{ ...draft.effective_plan!.effects[0], quantity: 5 }] } } as IoBatch;
const operator = { employee_id: "employee", name: "작업자", department: "조립", warehouse_role: "none" };
const status = vi.fn();
const originalFetch = globalThis.fetch;

function response(items: Item[]): Response { return { ok: true, status: 200, text: async () => JSON.stringify(items), json: async () => items } as Response; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getItems).mockImplementation((params) => itemsApi.getItems(params));
  vi.mocked(api.getBatch).mockResolvedValue(draft);
  vi.mocked(api.saveDraft).mockImplementation(async () => { vi.mocked(api.getBatch).mockResolvedValue(saved); return saved; });
  window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4");
});
afterEach(() => { globalThis.fetch = originalFetch; });

it.each([["desktop", true], ["mobile", true], ["desktop", false], ["mobile", false]] as const)("%s 초기 캐시=%s에서 늦은 단계 진입 재고 응답이 저장 후 최신 예약 재고를 덮지 않는다", async (layout, hasCache) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  const key = queryKeys.items.list({ limit: 2000, search: undefined });
  if (hasCache) client.setQueryData(key, [item]);
  let finishOld!: (value: Response) => void;
  let firstRequest!: Promise<Response>;
  let calls = 0;
  globalThis.fetch = vi.fn(async () => {
    calls += 1;
    if (calls === 1) {
      firstRequest = new Promise<Response>((resolve) => { finishOld = resolve; });
      return firstRequest;
    }
    return response([{ ...item, pending_quantity: 5 }]);
  }) as unknown as typeof fetch;
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  function Composer() {
    const data = useWarehouseData({ globalSearch: "", onStatusChange: status });
    return <View globalSearch="" operator={operator} employees={[]} items={data.items} inventoryQueryState={data.inventoryQueryState}
      setItems={data.setItems} onRefreshItems={data.refreshItems} onStatusChange={status} restoreDraft={draft} restoreNonce={1} restoreStep={4}
      onReservationChanged={() => invalidateWorkReservationQueries(client, { throwOnError: true })} />;
  }
  const view = render(<QueryClientProvider client={client}><Composer /></QueryClientProvider>);
  await waitFor(() => expect(calls).toBe(1));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "작업 내용 반영", exact: true }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
  if (hasCache) await waitFor(() => expect(client.getQueryData<Item[]>(key)?.[0].pending_quantity).toBe(5));
  await act(async () => { finishOld(response([item])); await firstRequest; await new Promise((resolve) => setTimeout(resolve, 0)); });
  await waitFor(() => expect(client.getQueryData<Item[]>(key)?.[0].pending_quantity).toBe(5));
  const row = screen.getByRole("button", { name: "재고 반영 변경" }).closest("[data-io-line]")!;
  await waitFor(() => expect(row.querySelector("[data-io-stock]")).toHaveTextContent("가능 재고10"));
  expect(api.getItems).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
