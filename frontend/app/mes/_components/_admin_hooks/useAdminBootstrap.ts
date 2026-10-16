"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type BOMDetailEntry,
  type DepartmentMaster,
  type Employee,
  type Item,
  type ProductModel,
} from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { useRealtimeRevision } from "@/lib/queries/realtime";

/**
 * 관리자 화면의 5개 도메인 부트스트랩 + BOM 새로고침 훅.
 *
 * Round-8 (R8-1) 추출. DesktopAdminView 의 6 useState + 2 useEffect (exhaustive-deps
 * disable Cat-C 2건) 를 1 hook 으로 묶고 useCallback 으로 deps 정상화.
 *
 *   - unlocked + globalSearch 변화 시 items/employees/departments fetch (Promise.all)
 *   - models 는 useModelsQuery(enabled: unlocked) 로 분리 — unlocked 게이트 동일,
 *     React Query 캐시를 로컬 productModels state 로 미러링해 기존 setProductModels
 *     낙관적 갱신 API 를 그대로 유지한다.
 *   - unlocked 변화 시 BOM 별도 fetch
 *   - realtime revision 변화 시 items/employees/BOM 갱신
 */
export interface UseAdminBootstrapOptions {
  unlocked: boolean;
  globalSearch: string;
  onError: (message: string) => void;
}

export interface UseAdminBootstrapResult {
  loading: boolean;
  hasData: boolean;
  loadError: string | null;
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

  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [allBomRows, setAllBomRows] = useState<BOMDetailEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const itemsRequestId = useRef(0);
  const employeesRequestId = useRef(0);
  const departmentsRequestId = useRef(0);
  const allBomRequestId = useRef(0);

  // 개인 저장 결과보다 먼저 시작한 조회가 저장 상태를 되돌리지 않게 한다.
  const setEmployees = useCallback((next: React.SetStateAction<Employee[]>): void => {
    employeesRequestId.current += 1;
    setEmployeesState(next);
  }, []);

  // models 만 React Query 로 분리 — enabled(unlocked) 로 게이트 보존.
  const { data: modelsData } = useModelsQuery({ enabled: unlocked });
  useEffect(() => {
    if (modelsData) setProductModels(modelsData);
  }, [modelsData]);

  const loadData = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(null);
    const requestId = ++itemsRequestId.current;
    const employeeRequestId = ++employeesRequestId.current;
    const departmentRequestId = ++departmentsRequestId.current;
    try {
    const [nextItems, nextEmployees, nextDepts] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees({ activeOnly: false }),
      api.getDepartments(),
    ]);
    if (requestId === itemsRequestId.current) setItems(nextItems);
    if (employeeRequestId === employeesRequestId.current) setEmployeesState(nextEmployees);
    if (departmentRequestId === departmentsRequestId.current) setDepartments(nextDepts);
    if (generation === loadGeneration.current) {
      setHasData(true);
    }
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(error instanceof Error ? error.message : "관리자 데이터를 불러오지 못했습니다.");
      throw error;
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [globalSearch]);

  const refreshAllBom = useCallback(() => {
    const requestId = ++allBomRequestId.current;
    void api
      .getAllBOM()
      .then((rows) => {
        if (requestId === allBomRequestId.current) setAllBomRows(rows);
      })
      .catch(() => {
        // Keep the last successful BOM snapshot when a realtime refresh fails.
      });
  }, []);

  // 품목만 재조회 — BOM 완료 토글 후 bom_completed_at 반영용
  const refreshItems = useCallback(async () => {
    const requestId = ++itemsRequestId.current;
    const next = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
    if (requestId === itemsRequestId.current) setItems(next);
  }, [globalSearch]);

  const refreshEmployees = useCallback(async () => {
    const requestId = ++employeesRequestId.current;
    const next = await api.getEmployees({ activeOnly: false });
    if (requestId === employeesRequestId.current) setEmployeesState(next);
  }, []);

  // 부서 후보만 갱신하여 열린 직원 편집 입력을 보존한다.
  const refreshDepartments = useCallback(async (): Promise<void> => {
    const requestId = ++departmentsRequestId.current;
    const next = await api.getDepartments();
    if (requestId === departmentsRequestId.current) setDepartments(next);
  }, []);

  // items/employees/departments 부트스트랩 — unlocked + globalSearch 변화 시
  useEffect(() => {
    if (!unlocked) return;
    void loadData().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."),
    );
  }, [unlocked, loadData, onError]);

  // BOM — unlocked 변화 시 별도 fetch
  useEffect(() => {
    if (!unlocked) return;
    refreshAllBom();
  }, [unlocked, refreshAllBom]);

  useEffect(() => {
    if (!unlocked || realtimeRevision === null) return;
    void refreshItems().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "품목 목록을 새로고침하지 못했습니다."),
    );
    void refreshEmployees().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "직원 목록을 새로고침하지 못했습니다."),
    );
    void refreshDepartments().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "부서 후보를 새로고침하지 못했습니다."),
    );
    refreshAllBom();
  }, [unlocked, realtimeRevision, refreshItems, refreshEmployees, refreshDepartments, refreshAllBom, onError]);

  return {
    loading, hasData, loadError,
    items, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows, setAllBomRows,
    loadData,
    refreshAllBom,
    refreshItems,
    refreshEmployees,
  };
}
