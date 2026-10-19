"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";
import { getOperatorAccessContext, updateCurrentOperatorAccess, useCurrentOperator } from "./useCurrentOperator";

/** One observer per authenticated workspace; cached profiles never replace a fresh login. */
export function OperatorAccessSync({ employeeId }: { employeeId: string }): null {
  const operator = useCurrentOperator();
  const context = getOperatorAccessContext();
  const query = useQuery({
    queryKey: queryKeys.employees.access(employeeId, context?.login ?? -1),
    enabled: operator?.employee_id === employeeId && context?.employeeId === employeeId,
    queryFn: async ({ signal }) => {
      const requested = getOperatorAccessContext();
      const employees = await api.getEmployees({ activeOnly: true }, signal);
      return { employee: employees.find((employee) => employee.employee_id === employeeId), context: requested };
    },
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  useEffect(() => {
    const data = query.data;
    if (operator?.employee_id === employeeId && query.isSuccess && !query.isFetching && data?.employee && data.context) {
      updateCurrentOperatorAccess(data.employee, data.context);
    }
  }, [employeeId, operator?.employee_id, query.data, query.isFetching, query.isSuccess]);
  return null;
}
