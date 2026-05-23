import { http, HttpResponse } from "msw";

const sampleAuditFiles = [
  { month: "2026-04", file_name: "inout_2026-04.csv", size_bytes: 1024, row_count: 50 },
];

export const adminHandlers = [
  http.post("*/api/settings/verify-pin", async ({ request }) => {
    const body = (await request.json()) as { pin: string };
    if (body.pin === "0000") return HttpResponse.json({ message: "ok" });
    return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
  }),

  http.get("*/api/admin/audit-csv/files", () =>
    HttpResponse.json(sampleAuditFiles),
  ),

  http.post("*/api/admin/audit-csv/backfill", () =>
    HttpResponse.json({ total_rows: 50, months: ["2026-04"] }),
  ),
];
