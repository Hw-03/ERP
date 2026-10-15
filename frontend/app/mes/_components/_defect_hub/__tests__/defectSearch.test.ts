import { describe, expect, it } from "vitest";
import { matchesDefectSearch } from "../defectSearch";
import type { DefectLocation } from "@/lib/api/types/defects";

const location: DefectLocation = {
  record_id: "r1", item_id: "i1", item_name: "AX-100", mes_code: "MES-001", department: "조립",
  quantity: 1, original_quantity: 1, pending_quantity: 0, available_quantity: 1,
  defective_at: null, reason_category: "치수", reason_memo: "Bracket Scratch",
  quarantined_by: "김길호", quarantined_by_employee_id: "e1", is_legacy: false,
  legacy_origin: null, has_bom: false,
};

describe("matchesDefectSearch", () => {
  it("matches item aliases and translated item names without expanding a reason", () => {
    const config = { version: "test", synonym_groups: [{ group_id: "group", version: 1, terms: ["배터리", "battery"] }],
      item_aliases: { i1: [{ alias_id: "alias", alias: "내장재" }] } };
    expect(matchesDefectSearch(location, "내장재", config)).toBe(true);
    expect(matchesDefectSearch({ ...location, item_name: "Battery", reason_memo: "Scratch" }, "배터리 김길호", config)).toBe(true);
    expect(matchesDefectSearch({ ...location, reason_memo: "battery" }, "배터리", config)).toBe(false);
  });
  it.each(["AX-100", " mes-001 ", " 조립", "치수", " bracket scratch ", "김길호"]) (
    "matches trimmed, case-insensitive values in %s",
    (query) => expect(matchesDefectSearch(location, query)).toBe(true),
  );

  it("returns false when no searchable field contains the query", () => {
    expect(matchesDefectSearch(location, "출하")).toBe(false);
  });
});
