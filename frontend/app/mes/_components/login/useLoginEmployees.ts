"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Employee } from "@/lib/api";
import { runLoginReadWithRetry, validateActiveEmployees } from "./loginReadRetry";

export type LoginEmployeesStatus = "loading" | "ready" | "error";

export interface LoginEmployeesResult {
  employees: Employee[];
  status: LoginEmployeesStatus;
  retry: () => void;
}

/**
 * OperatorLoginCard 의 active employees fetch 훅.
 *
 * Round-8 (R8-5) 추출. mount 시 1회 fetch — 로그인 화면 진입 시.
 * 활성 직원 목록만 필요 (activeOnly: true).
 */
export function useLoginEmployees(): LoginEmployeesResult {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [status, setStatus] = useState<LoginEmployeesStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void runLoginReadWithRetry(
      (readSignal) => api.getEmployees({ activeOnly: true }, readSignal),
      { stage: "active_employees", signal: controller.signal, validate: validateActiveEmployees },
    )
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setEmployees(loaded);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  return { employees, status, retry };
}
