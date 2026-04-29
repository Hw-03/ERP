"use client";

import { createContext, useContext } from "react";
import {
  useAdminDepartments,
  type AdminDepartmentsState,
  type UseAdminDepartmentsArgs,
} from "../_admin_hooks/useAdminDepartments";

const AdminDepartmentsContext = createContext<AdminDepartmentsState | null>(null);

export function AdminDepartmentsProvider({
  children,
  ...args
}: UseAdminDepartmentsArgs & { children: React.ReactNode }) {
  const value = useAdminDepartments(args);
  return <AdminDepartmentsContext.Provider value={value}>{children}</AdminDepartmentsContext.Provider>;
}

export function useAdminDepartmentsContext(): AdminDepartmentsState {
  const ctx = useContext(AdminDepartmentsContext);
  if (!ctx) {
    throw new Error("useAdminDepartmentsContext must be used inside <AdminDepartmentsProvider>");
  }
  return ctx;
}
