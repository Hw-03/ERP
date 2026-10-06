import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ShippingRequest } from "@/lib/api";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { MobileShippingScreen } from "../MobileShippingScreen";

const api = vi.hoisted(() => ({
  getShippingRequests: vi.fn(), getShippingRequest: vi.fn(), getShippingHistoryMonths: vi.fn(),
  getShippingRevisions: vi.fn(), completeShippingPickup: vi.fn(), cancelShippingPickup: vi.fn(),
  cancelShippingPrepare: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("../../shipping/MobileShippingRequestWizard", () => ({
  MobileShippingRequestWizard: ({ request, step }: { request: ShippingRequest; step: number }) =>
    <p>편집 {request.request_id} 단계 {step}</p>,
}));

describe("MobileShippingScreen 상태 전이", () => {
  it("픽업 완료·픽업 취소·준비 취소 후 같은 요청을 수정한다", async () => {
    let current = {
      request_id: "req-1", status: "PREPARED", request_quantity: 1,
      base_pf_item_id: "pf-1", base_pf_item_name: "기준 PF", base_pf_mes_code: "PF-1",
      final_pf_item_id: "pf-1", final_pf_item_name: "최종 PF", final_pf_mes_code: "PF-1",
      final_pa_item_name: "최종 PA", requested_by_name: "요청자", invoice_number: "INV-1",
      serial_numbers: "SN-1", prepared_at: "2026-10-06T00:00:00Z",
      created_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z",
      bom_lines: [], companion_lines: [], checklist_lines: [], events: [], transactions: [],
      allocations: [], stock_shortages: [], transaction_count: 0,
    } as unknown as ShippingRequest;
    api.getShippingRequest.mockImplementation(async () => current);
    api.getShippingRequests.mockImplementation(async () => [current]);
    api.getShippingHistoryMonths.mockResolvedValue([]);
    api.getShippingRevisions.mockResolvedValue([]);
    api.completeShippingPickup.mockImplementation(async () => (current = { ...current, status: "PICKED_UP" }));
    api.cancelShippingPickup.mockImplementation(async () => (current = { ...current, status: "PREPARED" }));
    api.cancelShippingPrepare.mockImplementation(async () => (current = { ...current, status: "PREPARING" }));
    window.history.replaceState({}, "", "/mes?tab=shipping&shippingView=requestDetail&shippingRequestId=req-1");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><DirtyGuardProvider><MobileShippingScreen /></DirtyGuardProvider></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "픽업 완료", exact: true }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "픽업 완료", exact: true }));
    await waitFor(() => expect(window.location.search).toContain("shippingView=historyWork"));
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "픽업 취소", exact: true }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "픽업 취소", exact: true }));
    await waitFor(() => expect(window.location.search).toContain("shippingView=requestDetail"));
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    fireEvent.click(await screen.findByRole("button", { name: "준비 완료 취소", exact: true }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "준비 완료 취소", exact: true }));
    await waitFor(() => expect(current.status).toBe("PREPARING"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "추가 작업" }));
    const edit = await screen.findByRole("button", { name: "요청 수정", exact: true });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    expect(await screen.findByText("편집 req-1 단계 1")).toBeInTheDocument();
    expect(window.location.search).toContain("shippingView=requestWork");
  });
});
