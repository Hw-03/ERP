"use client";

import { useEffect, useState } from "react";
import { api, type Employee } from "@/lib/api";

/**
 * OperatorLoginCard 의 active employees fetch 훅.
 *
 * Round-8 (R8-5) 추출. mount 시 1회 fetch — 로그인 화면 진입 시.
 * 활성 직원 목록만 필요 (activeOnly: true).
 */
export function useLoginEmployees(): Employee[] {
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    void api
      .getEmployees({ activeOnly: true })
      .then((emps) => setEmployees(emps))
      .catch(() => {});
  }, []);
  return employees;
}
