import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { matchesItemSearch, matchesItemSearchFields } from "../itemSearch";

type SearchCase = {
  name: string;
  query: string;
  groups?: string[][];
  name_fields: string[];
  literal_fields: string[];
  aliases: string[];
  expected: boolean;
};

const contract = JSON.parse(readFileSync(resolve(process.cwd(), "../backend/tests/fixtures/item-search-contract.json"), "utf8")) as {
  groups: string[][];
  cases: SearchCase[];
};

describe("item search shared contract", () => {
  it.each(contract.cases)("$name", (example) => {
    const config = {
      version: "fixture",
      synonym_groups: (example.groups ?? contract.groups).map((terms, index) => ({ group_id: String(index), version: 1, terms })),
      item_aliases: {},
    };
    expect(matchesItemSearchFields({
      nameFields: example.name_fields,
      literalFields: example.literal_fields,
      aliases: example.aliases,
    }, example.query, config)).toBe(example.expected);
  });

  it("resolves aliases only for the supplied item ID", () => {
    const config = {
      version: "fixture",
      synonym_groups: [],
      item_aliases: { one: [{ alias_id: "alias", alias: "내장재" }] },
    };
    expect(matchesItemSearch({ item_id: "one", item_name: "내부폼", mes_code: "3-PR-0001" }, "내장재", config)).toBe(true);
    expect(matchesItemSearch({ item_id: "two", item_name: "내부폼", mes_code: "3-PR-0002" }, "내장재", config)).toBe(false);
  });
});
