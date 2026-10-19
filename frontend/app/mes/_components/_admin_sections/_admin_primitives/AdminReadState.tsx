"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ReadFailure } from "../../common/ReadState";

export type AdminReadDomain = "items" | "employees" | "departments" | "models" | "bom";
export type AdminReadState = { status: "pending" | "ready" | "error"; error?: string };
export type AdminReadStates = Record<AdminReadDomain, AdminReadState>;
export interface AdminReadView { loading: boolean; error?: string; retry: () => void; managed?: boolean }
export const INITIAL_ADMIN_READ_STATES: AdminReadStates = {
  items: { status: "pending" }, employees: { status: "pending" }, departments: { status: "pending" },
  models: { status: "pending" }, bom: { status: "pending" },
};

const AdminReadContext = createContext<{ states: AdminReadStates; retry: (domain: AdminReadDomain) => void } | null>(null);
export const AdminReadProvider = AdminReadContext.Provider;

/** 성공한 빈 배열을 로딩으로 취급하지 않고, 필요한 도메인의 최초 조회만 묶는다. */
export function useAdminReadState(...domains: AdminReadDomain[]): AdminReadView {
  const context = useContext(AdminReadContext);
  const error = domains.map((domain) => context?.states[domain].error).find(Boolean);
  return {
    managed: !!context,
    loading: !error && domains.some((domain) => context?.states[domain].status === "pending"),
    error,
    retry: () => domains.forEach((domain) => {
      if (context?.states[domain].status === "error") context.retry(domain);
    }),
  };
}

/** 오류를 빈 데이터 안내와 구분하고, 로딩 안내는 화면 읽기에만 제공한다. */
export function AdminReadBoundary({ read, skeleton, children, label }: {
  read: ReturnType<typeof useAdminReadState>; skeleton: ReactNode; children: ReactNode; label: string;
}) {
  if (read.error) return <ReadFailure message={read.error} onRetry={read.retry} />;
  if (!read.loading) return <>{children}</>;
  return <div className="flex h-full min-h-0 flex-1 flex-col" role="status" aria-label={`${label} 불러오는 중`} aria-busy="true">
    <div aria-hidden="true" className="flex h-full min-h-0 flex-1 flex-col">{skeleton}</div>
  </div>;
}
