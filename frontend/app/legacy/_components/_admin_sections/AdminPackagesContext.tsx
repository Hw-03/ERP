"use client";

// AdminPackagesSection 의 18-prop drilling 을 끊는 React Context.

import { createContext, useContext } from "react";
import {
  useAdminPackages,
  type AdminPackagesState,
  type UseAdminPackagesArgs,
} from "../_admin_hooks/useAdminPackages";

const AdminPackagesContext = createContext<AdminPackagesState | null>(null);

export function AdminPackagesProvider({
  children,
  ...args
}: UseAdminPackagesArgs & { children: React.ReactNode }) {
  const value = useAdminPackages(args);
  return <AdminPackagesContext.Provider value={value}>{children}</AdminPackagesContext.Provider>;
}

export function useAdminPackagesContext(): AdminPackagesState {
  const ctx = useContext(AdminPackagesContext);
  if (!ctx) {
    throw new Error("useAdminPackagesContext must be used inside <AdminPackagesProvider>");
  }
  return ctx;
}
