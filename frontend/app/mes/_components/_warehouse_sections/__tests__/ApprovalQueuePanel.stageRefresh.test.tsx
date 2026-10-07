import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { server } from "@/lib/__tests__/msw/server";
import { AsResearchQueuePanel } from "../AsResearchQueuePanel";
import { DepartmentQueuePanel } from "../DepartmentQueuePanel";
import { WarehouseQueuePanel } from "../WarehouseQueuePanel";

const queues = [
  { Panel: AsResearchQueuePanel, path: "as-research-queue", action: "as-research-approve" },
  { Panel: DepartmentQueuePanel, path: "department-queue", action: "department-approve" },
  { Panel: WarehouseQueuePanel, path: "warehouse-queue", action: "approve" },
];

it.each(queues)("승인 단계 성공 후 해당 승인함 버튼과 대기 목록을 새로고침 없이 갱신한다: $path", async ({ Panel, path, action }) => {
  let processed = false;
  const request = { request_id: "stage-request", request_type: "internal_use", requester_name: "요청자", requester_department: "AS", status: "reserved", notes: null, reference_no: null, lines: [], created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z" };
  server.use(
    http.get(`*/api/stock-requests/${path}`, () => HttpResponse.json(processed ? [] : [request])),
    http.post(`*/api/stock-requests/stage-request/${action}`, () => {
      processed = true;
      // This stage succeeds while another stage still holds the business request.
      return HttpResponse.json({ ...request, status: "reserved" });
    }),
  );
  const onChanged = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Panel approverEmployeeId="approver" refreshNonce={0} onChanged={onChanged} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "승인", exact: true }));
  fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "0000" } });
  fireEvent.click(screen.getByRole("button", { name: "승인 확정", exact: true }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "승인", exact: true })).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "승인 확정", exact: true })).not.toBeInTheDocument();
  expect(screen.getByTestId("warehouse-empty-work-area")).toBeVisible();
  expect(onChanged).toHaveBeenCalledOnce();
});
