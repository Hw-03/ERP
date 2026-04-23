"use client";

import { useEffect, useState } from "react";
import { api, type Department, type Employee } from "@/lib/api";

export function useEmployees(params?: { department?: Department; activeOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = `${params?.department ?? ""}|${params?.activeOnly ?? true}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getEmployees({ department: params?.department, activeOnly: params?.activeOnly ?? true })
      .then((data) => {
        if (!cancelled) {
          setEmployees(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "직원 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { employees, loading, error };
}
