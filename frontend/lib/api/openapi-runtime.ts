export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function fieldsMatch(
  value: Record<string, unknown>,
  fields: readonly string[],
  predicate: (fieldValue: unknown) => boolean,
): boolean {
  return fields.every((field) => predicate(value[field]));
}
