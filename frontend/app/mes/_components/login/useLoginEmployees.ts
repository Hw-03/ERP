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
 * 로그인 진입·다시 포커스할 때 현재 활성 직원 후보를 조회한다.
 * 활성 직원 목록만 필요 (activeOnly: true).
 */
export function useLoginEmployees(): LoginEmployeesResult {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [status, setStatus] = useState<LoginEmployeesStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [retry]);

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
