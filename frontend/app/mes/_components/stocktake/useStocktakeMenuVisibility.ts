"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import { stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeMenuVisibility } from "@/lib/api/types/stocktake";
import { restoreOperatorSession, validateTabOwnership } from "@/lib/auth/operator-session";

/** A token-bound query lets realtime changes update already logged-in workers. */
export function useStocktakeMenuVisibility(operator: { employee_id: string } | null) {
  const [, refreshSession] = useReducer((revision: number) => revision + 1, 0);
  const employeeId = operator?.employee_id;
  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    void validateTabOwnership().then(() => { if (active) refreshSession(); });
    return () => { active = false; };
  }, [employeeId]);
  const session = operator ? restoreOperatorSession(operator.employee_id) : null;
  const token = session?.employee_id === operator?.employee_id ? session?.token : undefined;
  const query = useQuery({
    queryKey: ["stocktake", "menu-visibility", token],
    queryFn: ({ signal }) => stocktakeApi.read<StocktakeMenuVisibility>("/api/stocktakes/menu-visibility", token!, { signal }),
    enabled: !!token,
    retry: false,
  });
  return { ...query, data: query.isError || !token ? undefined : query.data };
}
