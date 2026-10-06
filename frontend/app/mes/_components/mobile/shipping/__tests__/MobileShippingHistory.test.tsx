import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileShippingHistory } from "../MobileShippingHistory";

vi.mock("@/lib/api", () => ({ api: { getShippingHistoryMonths: vi.fn(), getShippingHistory: vi.fn() } }));
import { api } from "@/lib/api";

function mount() {
  const onSelect = vi.fn();
  const onStatusChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MobileShippingHistory status="PICKED_UP" onStatusChange={onStatusChange} onSelect={onSelect} onBack={vi.fn()} /></QueryClientProvider>);
  return { onSelect, onStatusChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 2 }]);
  vi.mocked(api.getShippingHistory).mockResolvedValueOnce({ requests: [{ request_id: "req-1", invoice_number: "INV-1", final_pf_item_name: "완료 PF", request_quantity: 2, status: "PICKED_UP", created_at: "2026-07-01T00:00:00Z" }], next_cursor: "second", has_more: true } as never)
    .mockResolvedValue({ requests: [], next_cursor: null, has_more: false } as never);
});

describe("MobileShippingHistory", () => {
  it("opens a month and loads the next cursor", async () => {
    const { onSelect } = mount();
    fireEvent.click(await screen.findByRole("button", { name: /2026년/ }));
    fireEvent.click(screen.getByRole("button", { name: /7월.*2건/ }));
    expect(await screen.findByText("완료 PF")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(expect.objectContaining({ cursor: "second" }), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: /완료 PF/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ request_id: "req-1" }));
  });

  it("changes completed/cancelled status through parent callback", () => {
    const { onStatusChange } = mount();
    fireEvent.click(screen.getByRole("tab", { name: "취소" }));
    expect(onStatusChange).toHaveBeenCalledWith("CANCELLED");
  });

  it("keeps loaded rows when a later page fails and limits search input", async () => {
    vi.mocked(api.getShippingHistory).mockReset()
      .mockResolvedValueOnce({ requests: [{ request_id: "req-1", invoice_number: "INV-1", final_pf_item_name: "완료 PF", request_quantity: 2, status: "PICKED_UP", created_at: "2026-07-01T00:00:00Z" }], next_cursor: "second", has_more: true } as never)
      .mockRejectedValueOnce(new Error("page failed"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /2026년/ }));
    fireEvent.click(screen.getByRole("button", { name: /7월.*2건/ }));
    expect(await screen.findByText("완료 PF")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("완료 PF")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    const search = screen.getByPlaceholderText("인보이스 또는 PF 검색");
    fireEvent.change(search, { target: { value: "A".repeat(110) } });
    await waitFor(() => expect(search).toHaveValue("A".repeat(100)));
  });
});
