import { http, HttpResponse } from "msw";

const sampleRequest = {
  request_id: "req-1",
  requester_employee_id: "e1",
  request_type: "raw_receive",
  status: "pending_warehouse",
  reference_no: null,
  notes: null,
  lines: [],
  created_at: "2026-05-23T00:00:00",
  updated_at: "2026-05-23T00:00:00",
};

const warehouseQueue = [
  { ...sampleRequest, request_id: "req-1" },
  { ...sampleRequest, request_id: "req-2" },
];

export const stockRequestsHandlers = [
  http.get("*/api/stock-requests/warehouse-queue", () =>
    HttpResponse.json(warehouseQueue),
  ),

  http.get("*/api/stock-requests/warehouse-queue/count", () =>
    HttpResponse.json({ count: 2 }),
  ),

  http.get("*/api/stock-requests/department-queue", () =>
    HttpResponse.json([sampleRequest]),
  ),

  http.get("*/api/stock-requests", () =>
    HttpResponse.json([sampleRequest]),
  ),

  http.post("*/api/stock-requests", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { ...sampleRequest, ...body, request_id: "req-new" },
      { status: 201 },
    );
  }),

  http.post("*/api/stock-requests/:id/approve", async ({ params, request }) => {
    const body = (await request.json()) as { actor_employee_id: string; pin: string };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({
      ...sampleRequest,
      request_id: String(params.id),
      status: "approved",
    });
  }),

  http.post("*/api/stock-requests/:id/reject", async ({ params, request }) => {
    const body = (await request.json()) as { actor_employee_id: string; pin: string };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({
      ...sampleRequest,
      request_id: String(params.id),
      status: "rejected",
    });
  }),

  http.post("*/api/stock-requests/:id/cancel", async ({ params }) =>
    HttpResponse.json({
      ...sampleRequest,
      request_id: String(params.id),
      status: "cancelled",
    }),
  ),

  http.post("*/api/stock-requests/:id/submit", async ({ params }) =>
    HttpResponse.json({
      ...sampleRequest,
      request_id: String(params.id),
      status: "pending_warehouse",
    }),
  ),

  http.put("*/api/stock-requests/draft", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...sampleRequest, ...body });
  }),

  http.delete("*/api/stock-requests/draft/:id", () =>
    new HttpResponse(null, { status: 204 }),
  ),
];
