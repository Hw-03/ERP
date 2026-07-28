export function prioritizeTargetRequest<T extends { request_id: string }>(
  items: readonly T[],
  targetRequestId?: string | null,
): T[] {
  if (!targetRequestId) return [...items];
  const targetIndex = items.findIndex((item) => item.request_id === targetRequestId);
  if (targetIndex <= 0) return [...items];
  return [items[targetIndex], ...items.slice(0, targetIndex), ...items.slice(targetIndex + 1)];
}
