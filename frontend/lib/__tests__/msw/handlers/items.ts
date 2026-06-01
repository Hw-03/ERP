import { http, HttpResponse } from "msw";

const sampleItems = [
  {
    item_id: "I001",
    mes_code: "I001",
    item_name: "샘플품목A",
    process_type_code: "PA",
    unit: "EA",
    legacy_item_type: "원자재",
    supplier: "공급사1",
    min_stock: 10,
  },
  {
    item_id: "I002",
    mes_code: "I002",
    item_name: "샘플품목B",
    process_type_code: "PF",
    unit: "EA",
  },
];

export const itemsHandlers = [
  http.get("*/api/items", ({ request }) => {
    const url = new URL(request.url);
    const processType = url.searchParams.get("process_type_code");
    if (processType) {
      return HttpResponse.json(
        sampleItems.filter((it) => it.process_type_code === processType),
      );
    }
    return HttpResponse.json(sampleItems);
  }),

  http.get("*/api/items/:itemId", ({ params }) => {
    const found = sampleItems.find((it) => it.item_id === String(params.itemId));
    if (!found)
      return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    return HttpResponse.json(found);
  }),

  http.post("*/api/items", async ({ request }) => {
    const body = (await request.json()) as {
      item_name: string;
      process_type_code?: string;
      unit?: string;
    };
    return HttpResponse.json(
      {
        item_id: "I003",
        mes_code: "I003",
        item_name: body.item_name,
        process_type_code: body.process_type_code ?? "PA",
        unit: body.unit ?? "EA",
      },
      { status: 201 },
    );
  }),

  http.put("*/api/items/:itemId", async ({ params, request }) => {
    const body = (await request.json()) as { item_name?: string };
    return HttpResponse.json({
      item_id: String(params.itemId),
      mes_code: String(params.itemId),
      item_name: body.item_name ?? "샘플품목A",
      process_type_code: "PA",
      unit: "EA",
    });
  }),

  http.patch("*/api/items/:itemId/bom-completion", async ({ params, request }) => {
    const body = (await request.json()) as { completed: boolean };
    return HttpResponse.json({
      item_id: String(params.itemId),
      mes_code: String(params.itemId),
      item_name: "샘플품목A",
      bom_completed: body.completed,
    });
  }),
];
