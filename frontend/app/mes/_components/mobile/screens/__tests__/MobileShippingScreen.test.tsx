import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MobileShippingScreen } from "../MobileShippingScreen";
import type { ShippingRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getShippingRequests: vi.fn(),
    getShippingHistory: vi.fn(),
    updateShippingChecklist: vi.fn(),
    clearShippingChecklist: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function request(): ShippingRequest {
  return {
    request_id: "req-1",
    status: "PREPARING",
    base_pf_item_id: "pf-1",
    base_pf_item_name: "Standard PF",
    base_pf_mes_code: "PF-001",
    final_pa_item_id: null,
    final_pa_item_name: null,
    final_pf_item_id: null,
    final_pf_item_name: null,
    requested_by_name: "shipping",
    custom_pa_name: null,
    custom_pf_name: null,
    notes: null,
    prepared_at: null,
    picked_up_at: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    bom_lines: [],
    companion_lines: [],
    checklist_lines: [
      {
        line_id: "check-1",
        item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        checked: false,
      },
    ],
    events: [],
    transaction_count: 0,
  };
}

beforeEach(() => {
  vi.mocked(api.getShippingRequests).mockResolvedValue([request()]);
  vi.mocked(api.getShippingHistory).mockResolvedValue([]);
  vi.mocked(api.updateShippingChecklist).mockResolvedValue({
    ...request(),
    checklist_lines: [{ ...request().checklist_lines[0], checked: true }],
  });
  vi.mocked(api.clearShippingChecklist).mockResolvedValue(request());
});

describe("MobileShippingScreen", () => {
  it("모바일에서는 조회와 체크만 제공하고 PC 전용 완료 액션은 숨긴다", async () => {
    render(<MobileShippingScreen />);

    expect(await screen.findByText("Standard PF")).toBeInTheDocument();
    expect(screen.getByText(/생성·수정·완료 처리는 PC/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /준비 완료/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /픽업 완료/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cable Set 체크"));
    await waitFor(() => {
      expect(api.updateShippingChecklist).toHaveBeenCalledWith("req-1", {
        checks: [{ item_id: "acc-1", checked: true }],
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /전체 해제/ }));
    await waitFor(() => {
      expect(api.clearShippingChecklist).toHaveBeenCalledWith("req-1");
    });
  });
});
