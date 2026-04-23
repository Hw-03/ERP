"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ShipPackage } from "@/lib/api";

export function usePackages() {
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    return api
      .getShipPackages()
      .then((data) => {
        setPackages(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "패키지를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { packages, loading, error, refetch };
}
