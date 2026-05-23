import { http, HttpResponse } from "msw";

const sampleDepartments = [
  { id: 1, name: "AS1", display_order: 0, is_active: true, color_hex: "#1d4ed8" },
  { id: 2, name: "AS2", display_order: 1, is_active: true, color_hex: "#c2410c" },
];

export const departmentsHandlers = [
  http.get("*/api/departments", () => HttpResponse.json(sampleDepartments)),

  http.post("*/api/departments", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      display_order?: number;
      color_hex?: string;
      pin: string;
    };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json(
      {
        id: 3,
        name: body.name,
        display_order: body.display_order ?? 2,
        is_active: true,
        color_hex: body.color_hex ?? "#6d28d9",
      },
      { status: 201 },
    );
  }),

  http.put("*/api/departments/:id", async ({ params, request }) => {
    const body = (await request.json()) as {
      name?: string;
      is_active?: boolean;
      color_hex?: string | null;
      pin: string;
    };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({
      id: Number(params.id),
      name: body.name ?? "AS1",
      display_order: 0,
      is_active: body.is_active ?? true,
      color_hex: body.color_hex ?? "#1d4ed8",
    });
  }),

  http.delete("*/api/departments/:id", async ({ request }) => {
    try {
      const body = (await request.json()) as { pin?: string };
      if (body.pin === "0000") return new HttpResponse(null, { status: 204 });
    } catch {
      // body 파싱 실패 시 fallthrough
    }
    return HttpResponse.json({ detail: "PIN 누락" }, { status: 400 });
  }),

  http.patch("*/api/departments/reorder", async ({ request }) => {
    const body = (await request.json()) as { items: unknown[]; pin: string };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({ ok: true });
  }),
];
