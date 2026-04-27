"use client";

import { createContext, useContext } from "react";
import {
  useAdminMasterItems,
  type AdminMasterItemsState,
  type UseAdminMasterItemsArgs,
} from "../_admin_hooks/useAdminMasterItems";

const AdminMasterItemsContext = createContext<AdminMasterItemsState | null>(null);

export function AdminMasterItemsProvider({
  children,
  ...args
}: UseAdminMasterItemsArgs & { children: React.ReactNode }) {
  const value = useAdminMasterItems(args);
  return <AdminMasterItemsContext.Provider value={value}>{children}</AdminMasterItemsContext.Provider>;
}

export function useAdminMasterItemsContext(): AdminMasterItemsState {
  const ctx = useContext(AdminMasterItemsContext);
  if (!ctx) {
    throw new Error("useAdminMasterItemsContext must be used inside <AdminMasterItemsProvider>");
  }
  return ctx;
}
