import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/** A child price or BOM change also affects every ancestor, including unfinished reads. */
export async function invalidateCostQueries(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: queryKeys.costs.all });
  await client.invalidateQueries({ queryKey: queryKeys.costs.all });
}
