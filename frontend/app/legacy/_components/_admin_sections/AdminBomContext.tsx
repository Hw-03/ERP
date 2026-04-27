"use client";

// AdminBomSection 의 Props drilling 을 끊는 React Context.
// DesktopAdminView 가 <AdminBomProvider items={...} ...> 로 감싸고,
// 섹션 내부 어디에서나 useAdminBomContext() 로 동일한 상태에 접근한다.

import { createContext, useContext } from "react";
import { useAdminBom, type AdminBomState, type UseAdminBomArgs } from "../_admin_hooks/useAdminBom";

const AdminBomContext = createContext<AdminBomState | null>(null);

export function AdminBomProvider({
  children,
  ...args
}: UseAdminBomArgs & { children: React.ReactNode }) {
  const value = useAdminBom(args);
  return <AdminBomContext.Provider value={value}>{children}</AdminBomContext.Provider>;
}

export function useAdminBomContext(): AdminBomState {
  const ctx = useContext(AdminBomContext);
  if (!ctx) {
    throw new Error("useAdminBomContext must be used inside <AdminBomProvider>");
  }
  return ctx;
}
