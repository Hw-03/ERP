import { describe, it, expect } from "vitest";
import type { Item } from "@/lib/api";
import { matchesItemSearch } from "../itemSearch";

function makeItem(overrides: Partial<Item>): Item {
  return {
    item_id: "x",
    item_name: "",
    unit: "EA",
    quantity: 0,
    warehouse_qty: 0,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 0,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: null,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    department: null,
    ...overrides,
  };
}

describe("matchesItemSearch", () => {
  it("빈 키워드는 항상 매칭", () => {
    expect(matchesItemSearch(makeItem({ item_name: "방사구 너트" }), "")).toBe(true);
  });

  it("무공백 매칭: '방사구너트' 가 '방사구 너트' 를 매칭", () => {
    const item = makeItem({ item_name: "방사구 너트" });
    expect(matchesItemSearch(item, "방사구너트")).toBe(true);
  });

  it("공백 포함 키워드도 매칭", () => {
    const item = makeItem({ item_name: "방사구너트" });
    expect(matchesItemSearch(item, "방사구 너트")).toBe(true);
  });

  it("mes_code 로도 매칭", () => {
    const item = makeItem({ item_name: "콘덴서", mes_code: "6-AF-0001" });
    expect(matchesItemSearch(item, "6-af-0001")).toBe(true);
  });

  it("공백·하이픈·점·슬래시를 무시해 코드 부분 일치", () => {
    const item = makeItem({ item_name: "콘덴서", mes_code: "6-AF/01.2" });
    expect(matchesItemSearch(item, "6AF012")).toBe(true);
  });

  it("legacy_part 는 검색 대상에서 제외 (무관품 혼입 방지)", () => {
    const item = makeItem({ item_name: "콘덴서", legacy_part: "조립용 브라켓" });
    expect(matchesItemSearch(item, "조립")).toBe(false);
  });

  it("location 은 검색 대상에서 제외", () => {
    const item = makeItem({ item_name: "콘덴서", location: "실리콘 선반" });
    expect(matchesItemSearch(item, "실리")).toBe(false);
  });

  it("대소문자 무시", () => {
    const item = makeItem({ item_name: "Solo", mes_code: null });
    expect(matchesItemSearch(item, "SOLO")).toBe(true);
  });
});
