"use client";

import { createContext, useContext } from "react";
import {
  useAdminModels,
  type AdminModelsState,
  type UseAdminModelsArgs,
} from "../_admin_hooks/useAdminModels";

const AdminModelsContext = createContext<AdminModelsState | null>(null);

export function AdminModelsProvider({
  children,
  ...args
}: UseAdminModelsArgs & { children: React.ReactNode }) {
  const value = useAdminModels(args);
  return <AdminModelsContext.Provider value={value}>{children}</AdminModelsContext.Provider>;
}

export function useAdminModelsContext(): AdminModelsState {
  const ctx = useContext(AdminModelsContext);
  if (!ctx) {
    throw new Error("useAdminModelsContext must be used inside <AdminModelsProvider>");
  }
  return ctx;
}
