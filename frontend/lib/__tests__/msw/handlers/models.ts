import { http, HttpResponse } from "msw";

const sampleModels = [
  { slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false, display_order: 0 },
  { slot: 2, symbol: "B", model_name: "COCOON", is_reserved: false, display_order: 1 },
];

export const modelsHandlers = [
  http.get("*/api/models", () => HttpResponse.json(sampleModels)),

  http.post("*/api/models", async ({ request }) => {
    const body = (await request.json()) as { model_name: string; symbol?: string };
    return HttpResponse.json(
      {
        slot: 3,
        symbol: body.symbol ?? "C",
        model_name: body.model_name,
        is_reserved: false,
        display_order: 2,
      },
      { status: 201 },
    );
  }),

  http.put("*/api/models/:slot", async ({ params, request }) => {
    const body = (await request.json()) as {
      model_name?: string;
      symbol?: string;
      pin: string;
    };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({
      slot: Number(params.slot),
      symbol: body.symbol ?? "A",
      model_name: body.model_name ?? "DX3000",
      is_reserved: false,
      display_order: 0,
    });
  }),

  http.delete("*/api/models/:slot", async ({ request }) => {
    const headerPin = request.headers.get("X-Admin-Pin");
    if (headerPin && headerPin === "0000") return new HttpResponse(null, { status: 204 });
    try {
      const body = (await request.json()) as { pin?: string };
      if (body.pin === "0000") return new HttpResponse(null, { status: 204 });
    } catch {
      // body 파싱 실패 시 fallthrough
    }
    return HttpResponse.json({ detail: "PIN 누락" }, { status: 400 });
  }),

  http.patch("*/api/models/reorder", async ({ request }) => {
    const body = (await request.json()) as { items: unknown[]; pin: string };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({ ok: true });
  }),
];
