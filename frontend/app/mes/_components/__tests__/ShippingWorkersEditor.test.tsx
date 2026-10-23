import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ShippingRequest } from "@/lib/api";
import { ShippingWorkersEditor } from "../ShippingWorkersEditor";

vi.mock("@/lib/api", () => ({ api: { updateShippingWorkers: vi.fn() } }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));
import { api } from "@/lib/api";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";

const request = (overrides: Partial<ShippingRequest> = {}): ShippingRequest => ({ request_id: "req-1", status: "PREPARING", worker_names: "Kim", ...overrides } as ShippingRequest);
function mount(req = request()) {
  const client = new QueryClient();
  const saved = vi.fn();
  const view = (next: ShippingRequest) => <QueryClientProvider client={client}><ShippingWorkersEditor request={next} onSaved={saved} /></QueryClientProvider>;
  return { ...render(view(req)), view, saved, client };
}
beforeEach(() => vi.clearAllMocks());

it("turns pasted newlines into spaces and preserves delimiters", () => {
  mount(request({ worker_names: null }));
  fireEvent.paste(screen.getByLabelText("작업자"), { clipboardData: { getData: () => "Kim, Lee\r\nPark / Choi" } });
  expect(screen.getByLabelText("작업자")).toHaveValue("Kim, Lee Park / Choi");
});

it("saves only normalized workers and keeps failed input for retry", async () => {
  vi.mocked(api.updateShippingWorkers).mockRejectedValueOnce(new Error("save failed")).mockResolvedValueOnce(request({ worker_names: "Lee, Park" }));
  const { saved, client } = mount();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.change(screen.getByLabelText("작업자"), { target: { value: " Lee, Park " } });
  fireEvent.click(screen.getByRole("button", { name: "작업자 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("save failed");
  expect(screen.getByLabelText("작업자")).toHaveValue(" Lee, Park ");
  fireEvent.click(screen.getByRole("button", { name: "작업자 저장" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ worker_names: "Lee, Park" })));
  expect(api.updateShippingWorkers).toHaveBeenCalledWith("req-1", "Lee, Park");
  expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["stockRequests"] }));
});

it("preserves dirty workers when cache refresh changes the same request", () => {
  const { rerender, view } = mount();
  fireEvent.change(screen.getByLabelText("작업자"), { target: { value: "unsaved" } });
  rerender(view(request({ worker_names: "remote" })));
  expect(screen.getByLabelText("작업자")).toHaveValue("unsaved");
  expect(useRegisterDirty).toHaveBeenLastCalledWith("shipping-workers-req-1", true, expect.any(Function), expect.any(Function), { mode: "save" });
});

it("keeps a visible unsaved draft when preparation locks workers and offers discard navigation", () => {
  const { rerender, view } = mount();
  fireEvent.change(screen.getByLabelText("작업자"), { target: { value: "unsaved workers" } });
  rerender(view(request({ status: "PREPARED" })));
  expect(screen.queryByRole("textbox", { name: "작업자" })).not.toBeInTheDocument();
  expect(screen.getByText(/저장하지 않은 입력: unsaved workers/)).toBeInTheDocument();
  expect(useRegisterDirty).toHaveBeenLastCalledWith("shipping-workers-req-1", true, expect.any(Function), expect.any(Function), { mode: "confirm-only" });
  rerender(view(request()));
  expect(screen.getByLabelText("작업자")).toHaveValue("unsaved workers");
});

it.each(["PREPARED", "PICKED_UP", "CANCELLED"] as const)("shows workers read only in %s and unlocks after prepare undo", (status) => {
  const { rerender, view } = mount(request({ status }));
  expect(screen.queryByRole("textbox", { name: "작업자" })).not.toBeInTheDocument();
  expect(screen.getByText("Kim")).toBeInTheDocument();
  rerender(view(request()));
  expect(screen.getByLabelText("작업자")).toBeEnabled();
});
