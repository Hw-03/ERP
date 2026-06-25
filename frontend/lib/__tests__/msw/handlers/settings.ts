import { http, HttpResponse } from "msw";

const sampleAuditFiles = [
  { month: "2026-04", file_name: "inout_2026-04.csv", size_bytes: 1024, row_count: 50 },
  { month: "2026-05", file_name: "inout_2026-05.csv", size_bytes: 2048, row_count: 120 },
];

export const settingsHandlers = [
  http.post("*/api/settings/verify-pin", async ({ request }) => {
    const body = (await request.json()) as { pin: string };
    if (body.pin === "0000") return HttpResponse.json({ message: "ok" });
    return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
  }),

  http.put("*/api/settings/admin-pin", async ({ request }) => {
    const body = (await request.json()) as {
      current_pin: string;
      new_pin: string;
    };
    if (body.current_pin !== "0000")
      return HttpResponse.json({ detail: "현재 PIN 불일치" }, { status: 403 });
    return HttpResponse.json({ message: "PIN 변경 완료" });
  }),

  http.get("*/api/admin/audit-csv/files", () =>
    HttpResponse.json(sampleAuditFiles),
  ),

  http.post("*/api/admin/audit-csv/backfill", () =>
    HttpResponse.json({ total_rows: 170, months: ["2026-04", "2026-05"] }),
  ),
];
