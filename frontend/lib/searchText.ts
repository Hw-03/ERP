export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s.\/-]+/g, "");
}

export function matchesSearchText(value: string | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  return !normalizedQuery || normalizeSearchText(value ?? "").includes(normalizedQuery);
}
