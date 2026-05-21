import { describe, it, expect, afterEach, vi } from "vitest";
import { weeklyApi } from "../api/weekly";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("weeklyApi.getWeeklyReport — production_matrix 정규화", () => {
  it("Decimal 문자열 qty 를 number 로 정규화해 reduce 합산이 문자열 연결로 깨지지 않는다", async () => {
    // 백엔드 Pydantic Decimal 직렬화 재현: 숫자 필드가 문자열로 내려옴
    const body = {
      week_start: "2026-05-01",
      week_end: "2026-05-07",
      groups: [],
      summary: {},
      warnings: [],
      production_matrix: [
        {
          model_key: "m1",
          model_label: "A",
          tf_qty: "2.0000",
          hf_qty: "8.0000",
          vf_qty: "1.0000",
          nf_qty: "9.0000",
          af_qty: "39.0000",
          pf_qty: "33.0000",
          total_qty: "92.0000",
        },
        {
          model_key: "m2",
          model_label: "B",
          tf_qty: "0",
          hf_qty: "0",
          vf_qty: "0",
          nf_qty: "0",
          af_qty: "0",
          pf_qty: "0",
          total_qty: "8.0000",
        },
      ],
    };
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeResponse(body)),
    ) as unknown as typeof fetch;

    const res = await weeklyApi.getWeeklyReport({
      week_start: "2026-05-01",
      week_end: "2026-05-07",
    });

    const row = res.production_matrix[0];
    expect(typeof row.total_qty).toBe("number");
    expect(row.total_qty).toBe(92);
    expect(row.tf_qty).toBe(2);

    // 버그 재현 방지: 숫자 합산이어야 함 (문자열 연결이면 "092.000008.0000")
    const totalQty = res.production_matrix.reduce((s, r) => s + r.total_qty, 0);
    expect(totalQty).toBe(100);
  });

  it("production_matrix 누락 시 빈 배열로 안전 처리", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({
          week_start: "2026-05-01",
          week_end: "2026-05-07",
          groups: [],
          summary: {},
          warnings: [],
        }),
      ),
    ) as unknown as typeof fetch;

    const res = await weeklyApi.getWeeklyReport({
      week_start: "2026-05-01",
      week_end: "2026-05-07",
    });
    expect(res.production_matrix).toEqual([]);
  });
});
