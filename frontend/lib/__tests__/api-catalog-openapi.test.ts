// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogApi } from "../api/catalog";

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("catalogApi OpenAPI adapter", () => {
  it("nullable mes_code와 생략 가능한 표시 필드를 안전한 public shape로 바꾼다", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(makeResponse({
      item_id: "item-root",
      item_name: "코드 없는 품목",
      mes_code: null,
      unit: "EA",
      required_quantity: 1,
      current_stock: 3,
    }))) as unknown as typeof fetch;

    await expect(catalogApi.getBOMTree("item-root")).resolves.toEqual({
      item_id: "item-root",
      item_name: "코드 없는 품목",
      mes_code: null,
      process_type_code: null,
      unit: "EA",
      required_quantity: 1,
      current_stock: 3,
      additional_producible_quantity: null,
      production_capacity_ignored: false,
      children: [],
    });
  });

  it("실제 재고 수량이 누락되면 0으로 숨기지 않고 실패한다", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(makeResponse({
      item_id: "item-root",
      item_name: "재고 누락 품목",
      mes_code: null,
      unit: "EA",
      required_quantity: 1,
    }))) as unknown as typeof fetch;

    await expect(catalogApi.getBOMTree("item-root")).rejects.toThrow("current_stock");
  });
});
