import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShippingRequest } from "@/lib/api";
import { MobileShippingDetail } from "../MobileShippingDetail";

vi.mock("@/lib/api", () => ({ api: {
  updateShippingChecklist: vi.fn(), clearShippingChecklist: vi.fn(),
  updateShippingInvoice: vi.fn(), prepareShippingComplete: vi.fn(),
  completeShippingPickup: vi.fn(), cancelShippingPrepare: vi.fn(),
  cancelShippingPickup: vi.fn(), deleteShippingRequest: vi.fn(),
  getShippingRevisions: vi.fn().mockResolvedValue([]), getItem: vi.fn(),
} }));
import { api } from "@/lib/api";

function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    request_id: "req-1", status: "PREPARING", request_quantity: 3,
    base_pf_item_id: "pf-1", base_pf_item_name: "기준 PF", base_pf_mes_code: "PF-1",
    final_pa_item_id: "pa-1", final_pa_item_name: "최종 PA", final_pa_mes_code: "PA-1",
    final_pf_item_id: "pf-2", final_pf_item_name: "최종 PF", final_pf_mes_code: "PF-2",
    requested_by_name: "요청자", custom_pa_name: null, custom_pf_name: null,
    notes: "요청 메모", invoice_number: "INV-1", serial_numbers: null,
    prepared_at: null, picked_up_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    bom_lines: [], companion_lines: [], checklist_lines: [{ line_id: "line-1", item_id: "acc-1", item_name: "케이블", mes_code: "R-1", process_type_code: "R", quantity: 2, checked: false }],
    events: [], transactions: [], allocations: [], stock_shortages: [], transaction_count: 0,
    ...overrides,
  };
}

function mount(req = request()) {
  const onRequestChange = vi.fn();
  const onPickupCancelled = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MobileShippingDetail request={req} onRequestChange={onRequestChange} onEdit={vi.fn()} onBack={vi.fn()} onDeleted={vi.fn()} onPickupCancelled={onPickupCancelled} /></QueryClientProvider>);
  return { ...view, client, onRequestChange, onPickupCancelled };
}

beforeEach(() => vi.clearAllMocks());

describe("MobileShippingDetail", () => {
  it("shows a compact status header and keeps extended item details collapsed", () => {
    mount();
    expect(screen.getByRole("heading", { name: "출하 상세" })).toBeInTheDocument();
    expect(screen.getByText("준비 중")).toBeInTheDocument();
    expect(screen.getByText("3대")).toBeInTheDocument();
    expect(screen.getAllByText("INV-1")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /추가 PF·PA 정보/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("edits an invoice explicitly, then cancels or retries a failed save without losing the draft", async () => {
    vi.mocked(api.updateShippingInvoice).mockRejectedValueOnce(new Error("저장 실패"));
    mount();
    expect(screen.queryByRole("textbox", { name: "인보이스 번호" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인보이스 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "인보이스 번호" }), { target: { value: "INV-DRAFT" } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 저장" }));
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "인보이스 번호" })).toHaveValue("INV-DRAFT");
    fireEvent.click(screen.getByRole("button", { name: "인보이스 취소" }));
    expect(screen.queryByRole("textbox", { name: "인보이스 번호" })).not.toBeInTheDocument();
    expect(screen.getAllByText("INV-1")).toHaveLength(2);
  });

  it("requires explicit cancellation confirmation and explains the reservation effect", async () => {
    const prepared = request({ status: "PREPARED", serial_numbers: "SN-123" });
    vi.mocked(api.cancelShippingPrepare).mockResolvedValueOnce(request());
    mount(prepared);
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "준비 완료 취소" }));
    expect(api.cancelShippingPrepare).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /준비 완료 취소/ });
    expect(dialog).toHaveTextContent("예약");
    fireEvent.click(within(dialog).getByRole("button", { name: "준비 완료 취소" }));
    await waitFor(() => expect(api.cancelShippingPrepare).toHaveBeenCalledWith("req-1", {}));
  });
  it("locks invoice input while saving so a late response cannot discard later typing", async () => {
    let resolveSave!: (saved: ShippingRequest) => void;
    vi.mocked(api.updateShippingInvoice).mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "인보이스 수정" }));
    fireEvent.change(screen.getByLabelText("인보이스 번호"), { target: { value: "INV-2" } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 저장" }));
    expect(screen.getByLabelText("인보이스 번호")).toBeDisabled();
    await act(async () => resolveSave(request({ invoice_number: "INV-2" })));
    expect(screen.queryByLabelText("인보이스 번호")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인보이스 수정" }));
    expect(screen.getByLabelText("인보이스 번호")).toHaveValue("INV-2");
  });
  it("shows final PF, BOM, companions, and process-grouped checklist", () => {
    mount(request({ bom_lines: [{ line_id: "bom-1", parent_stage: "PA", child_item_id: "acc-1", item_name: "PA 케이블", mes_code: "R-1", process_type_code: "R", quantity: 1, unit: "EA", included: true, origin: "DEFAULT" }], companion_lines: [{ line_id: "comp-1", item_id: "box", item_name: "박스", mes_code: "BOX", process_type_code: "PK", quantity: 1, unit: "EA" }] }));
    expect(screen.getAllByText("최종 PF").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /BOM·동반 출하품/ }));
    expect(screen.getByText(/PA 케이블/)).toBeInTheDocument();
    expect(screen.getByText(/박스/)).toBeInTheDocument();
    expect(screen.getByText("R 구성품")).toBeInTheDocument();
    expect(screen.getByLabelText("케이블 체크")).not.toBeVisible();
    fireEvent.click(screen.getByText("R 구성품"));
    expect(screen.getByLabelText("케이블 체크")).toBeVisible();
  });

  it("keeps checklist input and error when the update fails", async () => {
    vi.mocked(api.updateShippingChecklist).mockRejectedValueOnce(new Error("저장 실패"));
    mount();
    fireEvent.click(screen.getByText("R 구성품"));
    fireEvent.click(screen.getByLabelText("케이블 체크"));
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(screen.getByLabelText("케이블 체크")).not.toBeChecked();
  });

  it("keeps checked state while a process group closes and clears only PREPARING after confirmation", async () => {
    const checked = request({ checklist_lines: [{ ...request().checklist_lines[0], checked: true }] });
    vi.mocked(api.clearShippingChecklist).mockResolvedValueOnce(request());
    const { onRequestChange } = mount(checked);
    const group = screen.getByText("R 구성품");
    fireEvent.click(group);
    expect(screen.getByLabelText("케이블 체크")).toBeChecked();
    fireEvent.click(group);
    expect(screen.getByLabelText("케이블 체크")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(api.clearShippingChecklist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "전체 해제" }));
    await waitFor(() => expect(api.clearShippingChecklist).toHaveBeenCalledWith("req-1"));
    await waitFor(() => expect(onRequestChange).toHaveBeenCalledWith(expect.objectContaining({ request_id: "req-1" })));
  });

  it("does not offer checklist clear after preparation", () => {
    mount(request({ status: "PREPARED" }));
    expect(screen.queryByRole("button", { name: "전체 해제" })).not.toBeInTheDocument();
  });

  it("requires invoice and serial text before preparing and confirms quantity", async () => {
    const req = request({ invoice_number: null });
    const { rerender, onRequestChange } = mount(req);
    expect(screen.getByRole("button", { name: "준비 완료" })).toBeDisabled();
    const saved = request({ invoice_number: "INV-2" });
    vi.mocked(api.updateShippingInvoice).mockResolvedValueOnce(saved);
    fireEvent.click(screen.getByRole("button", { name: "인보이스 수정" }));
    fireEvent.change(screen.getByLabelText("인보이스 번호"), { target: { value: "INV-2" } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 저장" }));
    await waitFor(() => expect(onRequestChange).toHaveBeenCalledWith(saved));
    rerender(<QueryClientProvider client={new QueryClient()}><MobileShippingDetail request={saved} onRequestChange={onRequestChange} onEdit={vi.fn()} onBack={vi.fn()} onDeleted={vi.fn()} onPickupCancelled={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("시리얼 번호"), { target: { value: "SN-1" } });
    fireEvent.click(screen.getByRole("button", { name: "준비 완료" }));
    expect(screen.getByRole("dialog", { name: "준비 완료 확인" })).toHaveTextContent("3대");
    expect(api.prepareShippingComplete).not.toHaveBeenCalled();
  });

  it("shows checklist progress, the saved serial after preparation, and shipment contents in confirmation", () => {
    const prepared = request({ status: "PREPARED", serial_numbers: "SN-123", companion_lines: [{ line_id: "c-1", item_id: "box", item_name: "동반 박스", mes_code: "B-1", process_type_code: "PK", quantity: 2, unit: "EA" }] });
    mount(prepared);
    expect(screen.getByRole("button", { name: /준비 확인.*0\/1 완료/ })).toBeInTheDocument();
    expect(screen.getByText("SN-123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "픽업 완료" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("최종 PF");
    expect(dialog).toHaveTextContent("PF-2");
    expect(dialog).toHaveTextContent("동반 박스");
    expect(dialog).toHaveTextContent("재고");
  });

  it("ignores a late shortage item lookup after unmount", async () => {
    let resolveItem!: (item: unknown) => void;
    vi.mocked(api.getItem).mockReturnValueOnce(new Promise((resolve) => { resolveItem = resolve; }) as never);
    const onGoToWarehouse = vi.fn();
    const req = request({ stock_shortages: [{ item_id: "acc-1", item_name: "케이블", mes_code: "R-1", process_type_code: "R", department: "조립", required_quantity: 2, current_quantity: 0, allocated_quantity: 0, available_quantity: 0, shortage_quantity: 2, phase: "PREPARE" }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(<QueryClientProvider client={client}><MobileShippingDetail request={req} onRequestChange={vi.fn()} onEdit={vi.fn()} onBack={vi.fn()} onDeleted={vi.fn()} onPickupCancelled={vi.fn()} onGoToWarehouse={onGoToWarehouse} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "창고에서 부서로 이동" }));
    unmount();
    resolveItem({ item_id: "acc-1" });
    await Promise.resolve();
    expect(onGoToWarehouse).not.toHaveBeenCalled();
  });

  it("pickup cancellation returns the updated request to the parent", async () => {
    const req = request({ status: "PICKED_UP", prepared_at: "2026-07-01T00:00:00Z" });
    const changed = request({ status: "PREPARED", prepared_at: "2026-07-01T00:00:00Z" });
    vi.mocked(api.cancelShippingPickup).mockResolvedValueOnce(changed);
    const { onPickupCancelled } = mount(req);
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "픽업 취소" }));
    fireEvent.click(screen.getByRole("button", { name: "픽업 취소" }));
    await waitFor(() => expect(onPickupCancelled).toHaveBeenCalledWith(changed));
  });

  it("syncs a clean invoice from server refresh while retaining an unsaved edit", () => {
    const initial = request({ invoice_number: "INV-1" });
    const { rerender, client, onRequestChange, onPickupCancelled } = mount(initial);
    const renderDetail = (req: ShippingRequest) => <QueryClientProvider client={client}><MobileShippingDetail request={req} onRequestChange={onRequestChange} onEdit={vi.fn()} onBack={vi.fn()} onDeleted={vi.fn()} onPickupCancelled={onPickupCancelled} /></QueryClientProvider>;
    rerender(renderDetail(request({ invoice_number: "INV-2" })));
    expect(screen.getAllByText("INV-2")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "인보이스 수정" }));
    fireEvent.change(screen.getByLabelText("인보이스 번호"), { target: { value: "DRAFT" } });
    rerender(renderDetail(request({ invoice_number: "INV-3" })));
    expect(screen.getByLabelText("인보이스 번호")).toHaveValue("DRAFT");
  });

  it("shows structured latest preparation changes", () => {
    mount(request({ latest_preparation_revision: { revision_id: "rev-1", request_id: "req-1", edited_by_employee_id: "e-1", edited_by_name: "김출하", summary: "raw", affects_preparation: true, created_at: "2026-07-24T09:30:00Z", changes: [
      { field: "request_quantity", before: 2, after: 3 },
      { field: "bom_lines", before: [{ parent_stage: "PA", child_item_id: "acc-1", item_name: "케이블", mes_code: "R-1", quantity: 1, unit: "EA", included: true }], after: [{ parent_stage: "PA", child_item_id: "acc-1", item_name: "케이블", mes_code: "R-1", quantity: 2, unit: "EA", included: false }] },
    ] } }));
    expect(screen.getByText("출하 수량 · BOM 구성 수정")).toBeInTheDocument();
    fireEvent.click(screen.getByText("변경 내용 보기"));
    expect(screen.getByText(/2대 → 3대/)).toBeInTheDocument();
    expect(screen.getByText(/수량 변경.*1EA → 2EA/)).toBeInTheDocument();
    expect(screen.getByText(/포함 상태 변경.*포함 → 제외/)).toBeInTheDocument();
  });
});
