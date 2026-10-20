// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch, type IoLine, type Item } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";
import { MobileIoComposeWizard } from "../../mobile/warehouse/MobileIoComposeWizard";

const realtime = vi.hoisted(() => ({ revision: 0 }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mes", useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=warehouse&section=compose&step=4"),
}));
vi.mock("@/lib/api", () => ({ api: { getItems: vi.fn(), getBatch: vi.fn(), saveDraft: vi.fn(), preview: vi.fn() } }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => realtime.revision }));
vi.mock("@/lib/queries/useBomQuery", () => ({ useBomListQuery: () => ({ data: [], isSuccess: true, isPending: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen: vi.fn() }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));
vi.mock("../IoTargetPicker", () => ({ IoTargetPicker: () => null }));
vi.mock("../IoConfirmStep", () => ({ IoConfirmStep: () => null }));

const operator = { employee_id: "employee", name: "작업자", department: "조립", warehouse_role: "none" };
const item = { item_id: "material", item_name: "예약 자재", mes_code: "MATERIAL", unit: "EA", quantity: 10, warehouse_qty: 10,
  pending_quantity: 5, locations: [] } as unknown as Item;
const line = { line_id: "line", item_id: item.item_id, item_name: item.item_name, mes_code: item.mes_code, unit: "EA", quantity: 5,
  included: true, origin: "manual", from_bucket: "warehouse", from_department: null, to_bucket: "production", to_department: "조립",
  direction: "move", shortage: 0 } as IoLine;
const draft = { batch_id: "reserved-batch", requester_employee_id: "employee", revision: 1, status: "draft", reservation_status: "reserved", work_type: "warehouse_io",
  sub_type: "warehouse_to_dept", to_department: "조립", bundles: [{ bundle_id: "bundle", source_kind: "direct_item",
    source_item_id: item.item_id, title: item.item_name, quantity: 5, lines: [line] }],
  effective_plan: { version: 1, fingerprint: "reserved", effects: [{ item_id: item.item_id, kind: "move", from: { bucket: "warehouse", department: null }, quantity: 5 }] },
} as unknown as IoBatch;

function row(): HTMLElement {
  return screen.getByRole("button", { name: "재고 반영 변경" }).closest("[data-io-line]") as HTMLElement;
}
function available(): HTMLElement { return row().querySelector("[data-io-stock]") as HTMLElement; }

beforeEach(() => {
  vi.resetAllMocks(); realtime.revision = 0;
  window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4");
  vi.mocked(api.getItems).mockResolvedValue([]);
  vi.mocked(api.getBatch).mockResolvedValue(draft);
  vi.mocked(api.saveDraft).mockResolvedValue({ ...draft, revision: 2 });
  vi.mocked(api.preview).mockResolvedValue({ bundles: [{ ...draft.bundles[0], bundle_id: "warehouse-bundle" }] } as never);
});

it.each(["desktop", "mobile"] as const)("%s 관리자 취소 후 현재 예약 가산을 없애고 편집 수량과 관측 버전은 보존한다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  const props = { globalSearch: "", operator, employees: [], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: draft, restoreNonce: 1, restoreStep: 4 as const };
  const view = render(<View {...props} items={[item]} />);
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고10"));
  vi.mocked(api.getBatch).mockResolvedValue({ ...draft, revision: 2, status: "cancelled", reservation_status: "inactive" });
  realtime.revision += 1;
  view.rerender(<View {...props} items={[{ ...item, pending_quantity: 0 }]} />);
  await waitFor(() => expect(api.getBatch).toHaveBeenCalledWith(draft.batch_id));
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고10"));
  expect(await screen.findByText(/현재 상태: 취소/)).toBeInTheDocument();
  expect(within(row()).getByRole("spinbutton")).toHaveValue(5);
  fireEvent.click(screen.getByRole("button", { name: "저장", exact: true }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ batch_id: draft.batch_id, expected_revision: 1 })));
});

it.each(["desktop", "mobile"] as const)("%s 실시간 재고 감소로 새로 부족해진 품목을 실제 행에서 선택하고 가져온다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  const processDraft = { ...draft, reservation_status: "not_required", work_type: "process", sub_type: "produce", from_department: "조립", effective_plan: null } as IoBatch;
  vi.mocked(api.getBatch).mockResolvedValue(processDraft);
  const props = { globalSearch: "", operator, employees: [], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: processDraft, restoreNonce: 1, restoreStep: 4 as const };
  const view = render(<View {...props} items={[{ ...item, pending_quantity: 0 }]} />);
  expect(screen.queryByTitle("창고에서 가져오기 대상으로 선택")).not.toBeInTheDocument();
  view.rerender(<View {...props} items={[{ ...item, pending_quantity: 8 }]} />);
  fireEvent.click(await screen.findByTitle("창고에서 가져오기 대상으로 선택"));
  fireEvent.click(screen.getByRole("button", { name: "선택한 1개 가져오기" }));
  await waitFor(() => expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({ sub_type: "warehouse_to_dept", targets: [expect.objectContaining({ item_id: item.item_id })] })));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(line.shortage).toBe(0);
});

it.each(["desktop", "mobile"] as const)("%s 다른 직원으로 전환하면 이전 직원의 예약을 가산하지 않는다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  render(<View globalSearch="" operator={{ ...operator, employee_id: "other-employee" }} employees={[]}
    items={[item]} setItems={vi.fn()} onStatusChange={vi.fn()} restoreDraft={draft} restoreNonce={1} restoreStep={4} />);
  await waitFor(() => expect(api.getBatch).toHaveBeenCalledWith(draft.batch_id));
  expect(available()).toHaveTextContent("가능 재고5");
});

it.each(["desktop", "mobile"] as const)("%s 저장 응답의 새 예약을 저장 전 재고에 중복 가산하지 않는다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  const initial = { ...draft, reservation_status: "not_required", effective_plan: null } as IoBatch;
  const saved = { ...draft, revision: 2 };
  vi.mocked(api.getBatch).mockResolvedValue(initial);
  vi.mocked(api.saveDraft).mockResolvedValue(saved);
  const props = { globalSearch: "", operator, employees: [], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: initial, restoreNonce: 1, restoreStep: 4 as const };
  const initialItems = [{ ...item, pending_quantity: 0 }];
  const view = render(<View {...props} items={initialItems} />);
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고10"));
  fireEvent.click(screen.getByRole("button", { name: "저장", exact: true }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(available()).toHaveTextContent("가능 재고10");
  vi.mocked(api.getBatch).mockResolvedValue(saved);
  view.rerender(<View {...props} items={[item]} />);
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고10"));
});

it.each(["desktop", "mobile"] as const)("%s 예약 투입이 같은 재저장은 재고 응답의 참조가 유지되어도 본인 예약 편집을 막지 않는다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  const initialItems = [{ ...item, quantity: 5, warehouse_qty: 5 }];
  render(<View globalSearch="" operator={operator} employees={[]} items={initialItems} setItems={vi.fn()}
    onStatusChange={vi.fn()} onReservationChanged={vi.fn().mockResolvedValue(undefined)} restoreDraft={draft} restoreNonce={1} restoreStep={4} />);
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고5"));
  fireEvent.click(screen.getByRole("button", { name: "저장", exact: true }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(available()).toHaveTextContent("가능 재고5");
  expect(screen.getByRole("button", { name: /제출확인/ })).toBeEnabled();
});

it.each(["desktop", "mobile"] as const)("%s 재고 조회 중·오류에는 예약을 가산하지 않고 같은 배열의 성공 복구를 반영한다", async (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  const items = [item];
  const props = { globalSearch: "", operator, employees: [], setItems: vi.fn(), onStatusChange: vi.fn(), restoreDraft: draft, restoreNonce: 1, restoreStep: 4 as const, items };
  const query = { queryKey: "items", isInvalidated: false, isSuccess: true, isFetching: true, dataUpdatedAt: 1, dataUpdateCount: 1 };
  const view = render(<View {...props} inventoryQueryState={query} />);
  expect(available()).toHaveTextContent("가능 재고5");
  view.rerender(<View {...props} inventoryQueryState={{ ...query, isSuccess: false, isFetching: false }} />);
  expect(available()).toHaveTextContent("가능 재고5");
  expect(api.getBatch).not.toHaveBeenCalled();
  view.rerender(<View {...props} inventoryQueryState={{ ...query, isFetching: false, dataUpdateCount: 2 }} />);
  await waitFor(() => expect(available()).toHaveTextContent("가능 재고10"));
});
