"use client";

import { useQuery } from "@tanstack/react-query";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { queryKeys } from "./keys";

export function useWarehouseMapQuery() {
  return useQuery({
    queryKey: queryKeys.warehouseMap.map(),
    queryFn: () => warehouseMapApi.getMap(),
  });
}
