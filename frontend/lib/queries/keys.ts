/**
 * Query key 표준 — W4-A.
 *
 * 모든 React Query 호출자는 이곳의 key를 사용해야 한다.
 * 도메인별로 `all` (전체 invalidate용)과 세부 key를 노출.
 *
 * 후속 도메인 (departments, employees, items, inventory, ...)은 점진 추가.
 */

export const queryKeys = {
  models: {
    all: ["models"] as const,
    list: () => ["models", "list"] as const,
    detail: (slot: number) => ["models", "detail", slot] as const,
  },
} as const;
