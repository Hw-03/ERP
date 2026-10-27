// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch, type IoLine, type Item } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";
import { MobileIoComposeWizard } from "../../mobile/warehouse/MobileIoComposeWizard";

vi.mock("next/navigation", () => ({ usePathname: () => "/mes", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams("tab=warehouse&section=compose&step=4") }));
vi.mock("@/lib/api", () => ({ api: { getItems: vi.fn(), getBatch: vi.fn() } }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
vi.mock("@/lib/queries/useBomQuery", () => ({ useBomParentIdsQuery: () => ({ data: [], isSuccess: true, isPending: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen: vi.fn() }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));
vi.mock("../IoTargetPicker", () => ({ IoTargetPicker: () => null }));

const item = { item_id: "material", item_name: "예약 자재", mes_code: "MATERIAL", unit: "EA", warehouse_qty: 1, quantity: 1, pending_quantity: 1, locations: [] } as unknown as Item;
const line = { line_id: "line", item_id: item.item_id, item_name: item.item_name, mes_code: item.mes_code, unit: "EA", quantity: 1,
  included: true, origin: "manual", from_bucket: "warehouse", from_department: null, to_bucket: "none", to_department: null, direction: "out", shortage: 1 } as IoLine;
const draft = { batch_id: "reserved", requester_employee_id: "employee", revision: 1, status: "draft", reservation_status: "reserved", work_type: "process", sub_type: "produce", from_department: "조립", notes: "회귀 검증",
  bundles: [{ bundle_id: "bundle", source_kind: "direct_item", source_item_id: item.item_id, title: item.item_name, quantity: 1, lines: [line] }],
  effective_plan: { effects: [{ item_id: item.item_id, kind: "out", quantity: 1, from: { bucket: "warehouse", department: null } }] },
} as IoBatch;
const operator = { employee_id: "employee", name: "작업자", department: "조립", warehouse_role: "none" };
const query = { queryKey: "inventory", isInvalidated: false, isSuccess: true, isFetching: true, dataUpdatedAt: 1, dataUpdateCount: 1 };

beforeEach(() => { vi.resetAllMocks(); window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4"); });

it.each([["desktop", false], ["mobile", false], ["desktop", true], ["mobile", true]] as const)("%s 이어서 작업은 확인 전 경고를 만들지 않고 실제 부족=%s를 구분한다", async (layout, shortage) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  let finish!: (batch: IoBatch) => void;
  vi.mocked(api.getBatch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const batch = shortage ? { ...draft, reservation_issue: { code: "stock_shortage", message: "shortage", shortages: [{ item_id: item.item_id, item_name: item.item_name, mes_code: item.mes_code, unit: "EA", location: { bucket: "warehouse", department: null }, required_quantity: 1, available_quantity: 0, shortage_quantity: 1 }] } } as IoBatch : draft;
  const props = { globalSearch: "", operator, employees: [], items: [shortage ? { ...item, warehouse_qty: 0, pending_quantity: 0 } : item], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: batch, restoreNonce: 1, restoreStep: 4 as const };
  const view = render(<View {...props} inventoryQueryState={query} />);
  expect(screen.queryByRole("button", { name: /재고가 부족한 항목이 있습니다/ })).not.toBeInTheDocument();
  expect(screen.getByText("사용 가능 재고를 확인하고 있습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /제출확인/ })).toBeDisabled();
  view.rerender(<View {...props} inventoryQueryState={{ ...query, isFetching: false, dataUpdateCount: 2 }} />);
  await waitFor(() => expect(api.getBatch).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: /재고가 부족한 항목이 있습니다/ })).not.toBeInTheDocument();
  await act(async () => finish(batch));
  await waitFor(() => expect(screen.queryByText("사용 가능 재고를 확인하고 있습니다.")).not.toBeInTheDocument());
  if (shortage) {
    expect(screen.getByRole("button", { name: /재고가 부족한 항목이 있습니다/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /제출확인/ })).toBeDisabled();
  } else {
    expect(screen.getByRole("button", { name: /제출확인/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /재고가 부족한 항목이 있습니다/ })).not.toBeInTheDocument();
  }
  expect(line.shortage).toBe(1);
});

it.each(["desktop", "mobile"] as const)("%s 최종 확인으로 복원해도 재고 확인 전에는 실행하지 않는다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  let finish!: (batch: IoBatch) => void;
  vi.mocked(api.getBatch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const props = { globalSearch: "", operator, employees: [], items: [item], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: draft, restoreNonce: 1, restoreStep: 5 as const };
  const view = render(<View {...props} inventoryQueryState={query} />);
  expect(screen.getByText("사용 가능 재고를 확인하고 있습니다.")).toBeInTheDocument();
  expect(screen.queryByText(/재고 부족 라인이 있어 제출할 수 없습니다/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeDisabled();
  view.rerender(<View {...props} inventoryQueryState={{ ...query, isFetching: false, dataUpdateCount: 2 }} />);
  await waitFor(() => expect(api.getBatch).toHaveBeenCalled());
  await act(async () => finish(draft));
  await waitFor(() => expect(screen.getByRole("button", { name: "부서 결재 요청 1건" })).toBeEnabled());
});
