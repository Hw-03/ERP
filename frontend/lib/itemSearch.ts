import { normalizeSearchText } from "@/lib/searchText";
import { EMPTY_ITEM_SEARCH_CONFIG, type ItemSearchConfig } from "@/lib/api/types/item-search";

export interface ItemSearchItem {
  item_id?: string | null;
  item_name?: string | null;
  mes_code?: string | null;
}

export interface ItemSearchFields {
  itemId?: string | null;
  nameFields: (string | null | undefined)[];
  literalFields?: (string | null | undefined)[];
  aliases?: string[];
}

type SearchClause = { literal: string; alternatives: string[] };

/** Consume the longest registered phrase before treating remaining words as AND conditions. */
function searchClauses(query: string, config: ItemSearchConfig): SearchClause[] {
  const words = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
  const groups = new Map<string, string[]>();
  for (const group of config.synonym_groups) {
    const alternatives = Array.from(new Set(group.terms.map(normalizeSearchText).filter(Boolean)));
    for (const term of alternatives) groups.set(term, alternatives);
  }
  const clauses: SearchClause[] = [];
  for (let start = 0; start < words.length;) {
    let end = start + 1;
    let literal = words[start];
    let alternatives = groups.get(literal) ?? [];
    for (let candidate = words.length; candidate > start + 1; candidate--) {
      const phrase = words.slice(start, candidate).join("");
      const matched = groups.get(phrase);
      if (!matched) continue;
      end = candidate;
      literal = phrase;
      alternatives = matched;
      break;
    }
    clauses.push({ literal, alternatives });
    start = end;
  }
  return clauses;
}

/** Short translated abbreviations must remain separate from other Latin letters and digits. */
function matchesAlternative(value: string, term: string): boolean {
  if (!/^[a-z]{1,3}$/.test(term)) return normalizeSearchText(value).includes(term);
  const boundaryText = value.toLowerCase().replace(/[.\/-]+/g, "");
  const spacedTerm = term.split("").join("\\s*");
  return new RegExp(`(^|[^a-z0-9])${spacedTerm}($|[^a-z0-9])`).test(boundaryText);
}

/** Share item semantics while keeping each screen's extra fields literal and explicitly scoped. */
export function matchesItemSearchFields(
  fields: ItemSearchFields,
  keyword: string,
  config: ItemSearchConfig = EMPTY_ITEM_SEARCH_CONFIG,
): boolean {
  const fullQuery = normalizeSearchText(keyword);
  if (!fullQuery) return true;
  const aliases = [
    ...(fields.aliases ?? []),
    ...(fields.itemId ? (config.item_aliases[fields.itemId] ?? []).map((entry) => entry.alias) : []),
  ];
  const semanticFields = [...fields.nameFields, ...aliases].filter((value): value is string => typeof value === "string");
  const literalFields = [...semanticFields, ...(fields.literalFields ?? [])].filter((value): value is string => typeof value === "string");
  const normalizedFields = literalFields.map(normalizeSearchText);
  if (normalizedFields.some((value) => value.includes(fullQuery))) return true;
  return searchClauses(keyword, config).every(({ literal, alternatives }) =>
    normalizedFields.some((value) => value.includes(literal)) ||
    alternatives.some((term) => semanticFields.some((value) => matchesAlternative(value, term))),
  );
}

/** Match only the item name, code, and aliases; unrelated location/supplier fields stay excluded. */
export function matchesItemSearch(
  item: ItemSearchItem,
  keyword: string,
  config: ItemSearchConfig = EMPTY_ITEM_SEARCH_CONFIG,
): boolean {
  return matchesItemSearchFields({ itemId: item.item_id, nameFields: [item.item_name], literalFields: [item.mes_code] }, keyword, config);
}
