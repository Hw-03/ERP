"use client";

import { createContext, useContext } from "react";
import {
  useAdminEmployees,
  type AdminEmployeesState,
  type UseAdminEmployeesArgs,
} from "../_admin_hooks/useAdminEmployees";

const AdminEmployeesContext = createContext<AdminEmployeesState | null>(null);

export function AdminEmployeesProvider({
  children,
  ...args
}: UseAdminEmployeesArgs & { children: React.ReactNode }) {
  const value = useAdminEmployees(args);
  return <AdminEmployeesContext.Provider value={value}>{children}</AdminEmployeesContext.Provider>;
}

export function useAdminEmployeesContext(): AdminEmployeesState {
  const ctx = useContext(AdminEmployeesContext);
  if (!ctx) {
    throw new Error("useAdminEmployeesContext must be used inside <AdminEmployeesProvider>");
  }
  return ctx;
}
