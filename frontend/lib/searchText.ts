export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s.\/-]+/g, "");
}

export function matchesSearchText(value: string | null | undefined, query: string): boolean {
  return matchesSearchFields([value], query);
}

/** Apply the same literal AND rules to fields explicitly selected by the caller. */
export function matchesSearchFields(values: (string | null | undefined)[], query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const fields = values.map((value) => normalizeSearchText(value ?? ""));
  if (fields.some((value) => value.includes(normalizedQuery))) return true;
  return query.split(/\s+/).map(normalizeSearchText).filter(Boolean)
    .every((word) => fields.some((value) => value.includes(word)));
}
