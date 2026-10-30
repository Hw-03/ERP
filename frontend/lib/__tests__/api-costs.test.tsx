import { afterEach, describe, expect, it, vi } from "vitest";
import { costsApi } from "../api/costs";
import { ApiError } from "../api-core";

afterEach(() => vi.unstubAllGlobals());
describe("원가 API 계약", () => {
  it("시뮬레이션 시급은 읽기 계산 요청에만 전달한다", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await costsApi.getItemCost("a", "token", undefined, "0");
    await costsApi.getItemSummaries(["a"], "token", undefined, "12000.50");
    expect(fetcher.mock.calls[0][0]).toBe("/api/costs/items/a?simulation_hourly_rate=0");
    expect(fetcher.mock.calls[1][0]).toBe("/api/costs/item-summaries?simulation_hourly_rate=12000.50");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ item_ids: ["a"] });
  });
  it("정보 조회·통합 저장 모두 작업자 세션을 보내고 변경값을 보존한다", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await costsApi.getPurchaseInfo("raw", "manager-token");
    const patch = { supplier: "supplier", standard_work_minutes: "0", hourly_labor_rate: null };
    await costsApi.updatePurchaseInfo("raw", "manager-token", patch);
    expect(fetcher.mock.calls[0][0]).toBe("/api/costs/items/raw/purchase-info");
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("X-Operator-Session")).toBe("manager-token");
    expect(fetcher.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(patch);
  });
  it("목록 원가를 묶어 읽고 소수 문자열과 null을 유지한다", async () => {
    const rows = [{ item_id: "a", unit_cost: "123.45", own_labor_cost: null, amount: "123.45", status: "partial" }];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows)));
    vi.stubGlobal("fetch", fetcher);
    expect(await costsApi.getItemSummaries(["a"], "actor-token")).toEqual(rows);
    expect(fetcher.mock.calls[0][0]).toBe("/api/costs/item-summaries");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ item_ids: ["a"] });
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("X-Operator-Session")).toBe("actor-token");
  });
  it("선택 품목과 명시적인 작업자 세션을 전달한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ item_id: "a-b", tree: { quantity_per_parent: "9007199254740993", required_quantity: "994014980014994001" } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await costsApi.getItemCost("a-b", "actor-token");
    expect(result.tree.required_quantity).toBe("994014980014994001");
    expect(result.tree.quantity_per_parent).toBe("9007199254740993");
    expect(fetcher.mock.calls[0][0]).toBe("/api/costs/items/a-b");
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("X-Operator-Session")).toBe("actor-token");
  });
  it("기준값의 소수 문자열·0·null을 변환하지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    const values = { standard_purchase_price: "0", standard_work_minutes: "1.25", purchase_price_effective_date: null };
    await costsApi.updateItemStandards("part", "actor-token", values);
    expect(fetcher.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(values);
  });
  it.each([401, 403])("실패 상태 %s를 화면에서 판별할 수 있게 보존한다", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "권한을 확인해 주세요." }), { status })));
    await expect(costsApi.getStandards("actor-token")).rejects.toMatchObject<ApiError>({ status } as ApiError);
  });
});
