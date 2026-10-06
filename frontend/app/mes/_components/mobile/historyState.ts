/** Next의 내부 이동 표식을 복사하면 native history의 searchParams 동기화가 생략된다. */
export function mobileHistoryState(state: Record<string, unknown> | null, index: number): Record<string, unknown> {
  const next = { ...state, mobileShippingIndex: index } as Record<string, unknown>;
  delete next.__NA;
  delete next._N;
  delete next.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return next;
}
