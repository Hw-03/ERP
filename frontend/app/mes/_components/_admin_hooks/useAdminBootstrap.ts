"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  type BOMDetailEntry,
  type DepartmentMaster,
  type Employee,
  type Item,
  type ProductModel,
} from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { useItemsQuery } from "@/lib/queries/useItemsQuery";
import { useBomListQuery } from "@/lib/queries/useBomQuery";
import { queryKeys } from "@/lib/queries/keys";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { INITIAL_ADMIN_READ_STATES, type AdminReadDomain, type AdminReadStates } from "../_admin_sections/_admin_primitives/AdminReadState";

/**
 * 관리자 화면의 5개 도메인 부트스트랩 + BOM 새로고침 훅.
 *
 * Round-8 (R8-1) 추출. DesktopAdminView 의 6 useState + 2 useEffect (exhaustive-deps
 * disable Cat-C 2건) 를 1 hook 으로 묶고 useCallback 으로 deps 정상화.
 *
 * 품목·BOM은 공유 캐시를 사용하고 realtime provider가 한 번만 무효화한다.
 * 직원·부서는 기존 저장 권한과 응답 순서 보호를 유지한다.
 */
export interface UseAdminBootstrapOptions {
  unlocked: boolean;
  globalSearch: string;
  onError: (message: string) => void;
}

export interface UseAdminBootstrapResult {
  readStates: AdminReadStates;
  retryRead: (domain: AdminReadDomain) => void;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  productModels: ProductModel[];
  setProductModels: React.Dispatch<React.SetStateAction<ProductModel[]>>;
  departments: DepartmentMaster[];
  setDepartments: React.Dispatch<React.SetStateAction<DepartmentMaster[]>>;
  allBomRows: BOMDetailEntry[];
  setAllBomRows: React.Dispatch<React.SetStateAction<BOMDetailEntry[]>>;
  loadData: () => Promise<void>;
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;
  refreshEmployees: () => Promise<void>;
}

export function useAdminBootstrap(opts: UseAdminBootstrapOptions): UseAdminBootstrapResult {
  const { unlocked, globalSearch, onError } = opts;
  const realtimeRevision = useRealtimeRevision();
  const queryClient = useQueryClient();
  const itemParams = useMemo(() => ({ limit: 2000, search: globalSearch.trim() || undefined }), [globalSearch]);
  const itemsQuery = useItemsQuery(itemParams, { enabled: unlocked });
  const bomQuery = useBomListQuery({ enabled: unlocked });
  const { refetch: refetchItems } = itemsQuery;
  const { refetch: refetchBom } = bomQuery;
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);
  const employeesRequestId = useRef(0);
  const departmentsRequestId = useRef(0);
  const [readStates, setReadStates] = useState(INITIAL_ADMIN_READ_STATES);
  const loadedDomains = useRef(new Set<AdminReadDomain>());
  const previousRevision = useRef(realtimeRevision);

  // 조회가 저장 응답을 덮어쓰지 않도록 취소 후 동일 캐시를 갱신한다.
  const setItems = useCallback((next: React.SetStateAction<Item[]>): void => {
    const queryKey = queryKeys.items.list(itemParams);
    void queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData<Item[]>(queryKey, (current) => typeof next === "function" ? next(current ?? []) : next);
  }, [itemParams, queryClient]);
  const setAllBomRows = useCallback((next: React.SetStateAction<BOMDetailEntry[]>): void => {
    const queryKey = queryKeys.bom.list();
    void queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData<BOMDetailEntry[]>(queryKey, (current) => typeof next === "function" ? next(current ?? []) : next);
  }, [queryClient]);

  const markPending = useCallback((domain: AdminReadDomain): void => {
    if (!loadedDomains.current.has(domain)) setReadStates((current) => current[domain].status === "pending" ? current : { ...current, [domain]: { status: "pending" } });
  }, []);
  const markReady = useCallback((domain: AdminReadDomain): void => {
    if (loadedDomains.current.has(domain)) return;
    loadedDomains.current.add(domain);
    setReadStates((current) => current[domain].status === "ready" ? current : { ...current, [domain]: { status: "ready" } });
  }, []);
  const markFailure = useCallback((domain: AdminReadDomain, failure: unknown): void => {
    if (!loadedDomains.current.has(domain)) setReadStates((current) => ({ ...current,
      [domain]: { status: "error", error: failure instanceof Error ? failure.message : "관리자 데이터를 불러오지 못했습니다." },
    }));
  }, []);

  // 개인 저장 결과보다 먼저 시작한 조회가 저장 상태를 되돌리지 않게 한다.
  const setEmployees = useCallback((next: React.SetStateAction<Employee[]>): void => {
    employeesRequestId.current += 1;
    setEmployeesState(next);
    markReady("employees");
  }, [markReady]);

  // models 만 React Query 로 분리 — enabled(unlocked) 로 게이트 보존.
  const { data: modelsData, error: modelsError, refetch: refetchModels } = useModelsQuery({ enabled: unlocked });
  useEffect(() => {
    if (modelsData !== undefined) { setProductModels(modelsData); markReady("models"); }
    else if (modelsError) markFailure("models", modelsError);
  }, [modelsData, modelsError, markReady, markFailure]);

  const refreshAllBom = useCallback(() => {
    void refetchBom();
  }, [refetchBom]);

  // 품목만 재조회 — BOM 완료 토글 후 bom_completed_at 반영용
  const refreshItems = useCallback(async () => {
    await refetchItems({ throwOnError: true });
  }, [refetchItems]);

  const refreshEmployees = useCallback(async () => {
    const requestId = ++employeesRequestId.current;
    markPending("employees");
    try {
      const next = await api.getEmployees({ activeOnly: false });
      if (requestId === employeesRequestId.current) { setEmployeesState(next); markReady("employees"); }
    } catch (failure) { if (requestId === employeesRequestId.current) markFailure("employees", failure); throw failure; }
  }, [markPending, markReady, markFailure]);

  const refreshDepartments = useCallback(async () => {
    const requestId = ++departmentsRequestId.current;
    markPending("departments");
    try {
      const next = await api.getDepartments();
      if (requestId === departmentsRequestId.current) { setDepartments(next); markReady("departments"); }
    } catch (failure) { if (requestId === departmentsRequestId.current) markFailure("departments", failure); throw failure; }
  }, [markPending, markReady, markFailure]);

  const loadData = useCallback(async () => {
    await Promise.all([refreshItems(), refreshEmployees(), refreshDepartments()]);
  }, [refreshItems, refreshEmployees, refreshDepartments]);

  const retryRead = useCallback((domain: AdminReadDomain): void => {
    if (domain === "bom") { refreshAllBom(); return; }
    if (domain === "models") { markPending("models"); void refetchModels(); return; }
    const refresh = { items: refreshItems, employees: refreshEmployees, departments: refreshDepartments }[domain];
    void refresh().catch((failure: unknown) => onError(failure instanceof Error ? failure.message : "관리자 데이터를 불러오지 못했습니다."));
  }, [refreshAllBom, refetchModels, refreshItems, refreshEmployees, refreshDepartments, markPending, onError]);

  // 검색 변경은 품목 쿼리만 바꾼다. 직원·부서 초기 조회는 잠금 해제 시 한 번.
  useEffect(() => {
    if (!unlocked) return;
    void Promise.all([refreshEmployees(), refreshDepartments()]).catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."),
    );
  }, [unlocked, refreshEmployees, refreshDepartments, onError]);

  useEffect(() => {
    if (!unlocked || realtimeRevision === null || previousRevision.current === realtimeRevision) return;
    previousRevision.current = realtimeRevision;
    void refreshEmployees().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "직원 목록을 새로고침하지 못했습니다."),
    );
    void refreshDepartments().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "부서 후보를 새로고침하지 못했습니다."),
    );
  }, [unlocked, realtimeRevision, refreshEmployees, refreshDepartments, onError]);

  const queryReadState = (data: unknown, error: Error | null, fetching: boolean): AdminReadStates["items"] =>
    data !== undefined ? { status: "ready" } : error && !fetching
      ? { status: "error", error: error.message } : { status: "pending" };

  return {
    readStates: {
      ...readStates,
      items: queryReadState(itemsQuery.data, itemsQuery.error, itemsQuery.isFetching),
      bom: queryReadState(bomQuery.data, bomQuery.error, bomQuery.isFetching),
    }, retryRead,
    items: itemsQuery.data ?? EMPTY_ITEMS, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows: bomQuery.data ?? EMPTY_BOM, setAllBomRows,
    loadData,
    refreshAllBom,
    refreshItems,
    refreshEmployees,
  };
}

const EMPTY_ITEMS: Item[] = [];
const EMPTY_BOM: BOMDetailEntry[] = [];
