import { http, HttpResponse } from "msw";

const sampleTransaction = {
  log_id: "log-1",
  item_id: "i-1",
  transaction_type: "RECEIVE",
  quantity: 10,
  reference_no: null,
  notes: null,
  created_at: "2026-05-23T00:00:00",
};

export const productionHandlers = [
  http.get("*/api/production/capacity", () =>
    HttpResponse.json({
      items: [{ item_id: "i-1", item_name: "부품A", can_produce: 5 }],
    }),
  ),

  http.get("*/api/production/bom-check/:itemId", ({ request }) => {
    const url = new URL(request.url);
    const qty = Number(url.searchParams.get("quantity") ?? 0);
    return HttpResponse.json({ can_produce: qty > 0, max_producible: 100 });
  }),

  http.post("*/api/production/receipt", async ({ request }) => {
    const body = (await request.json()) as { item_id: string; quantity: number };
    return HttpResponse.json(
      { ...sampleTransaction, item_id: body.item_id, quantity: body.quantity },
      { status: 201 },
    );
  }),

  http.get("*/api/inventory/transactions", () =>
    HttpResponse.json([sampleTransaction]),
  ),

  http.get("*/api/inventory/transactions/summary", () =>
    HttpResponse.json({
      total: 1,
      warehouse_count: 1,
      dept_count: 0,
      adjust_count: 0,
      department_counts: {},
    }),
  ),

  http.post("*/api/inventory/transactions/:id/meta-edit", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.edited_by_pin)
      return HttpResponse.json({ detail: "PIN 필수" }, { status: 400 });
    return HttpResponse.json({ ...sampleTransaction, log_id: String(params.id), ...body });
  }),

  http.get("*/api/inventory/transactions/:id/edits", ({ params }) =>
    HttpResponse.json([
      {
        edit_id: "e-1",
        log_id: String(params.id),
        edited_by_employee_id: "e1",
        changed_at: "2026-05-23T00:00:00",
      },
    ]),
  ),

  http.post("*/api/inventory/transactions/:id/quantity-correction", async ({ params, request }) => {
    const body = (await request.json()) as { quantity_change: number };
    return HttpResponse.json({
      original: { ...sampleTransaction, log_id: String(params.id) },
      correction: {
        ...sampleTransaction,
        log_id: `${String(params.id)}-corr`,
        quantity: body.quantity_change,
      },
    });
  }),
];
