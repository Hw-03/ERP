"use client";

import { useCallback, useRef, useState } from "react";
import type { Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { useItemQuery } from "@/lib/queries/useItemsQuery";
import { getStoredBootId, useCurrentOperator } from "../login/useCurrentOperator";

export type InventoryDetailStatus = "loading" | "active" | "deleted" | "not-found" | "access-error" | "read-error";

type InventoryViewSnapshot = {
  version: 1;
  bootId: string;
  search: string;
  selectedItemId: string | null;
  detailOpen: boolean;
};

type InventoryViewState = InventoryViewSnapshot & { scopeKey: string };

/** 직원 세션과 서버 boot가 일치하는 최소 UI 정보만 복원한다. */
function readSnapshot(scopeKey: string, bootId: string): InventoryViewState {
  const empty: InventoryViewState = { scopeKey, version: 1, bootId, search: "", selectedItemId: null, detailOpen: false };
  if (!scopeKey || typeof window === "undefined") return empty;
  try {
    const raw = window.sessionStorage.getItem(scopeKey);
    if (!raw) return empty;
    const value = JSON.parse(raw) as Partial<InventoryViewSnapshot>;
    if (value.version !== 1 || value.bootId !== bootId || typeof value.search !== "string" || typeof value.detailOpen !== "boolean") return empty;
    if (value.selectedItemId !== null && (typeof value.selectedItemId !== "string" || !value.selectedItemId.trim())) return empty;
    return { ...empty, search: value.search, selectedItemId: value.selectedItemId, detailOpen: value.detailOpen && !!value.selectedItemId };
  } catch {
    return empty;
  }
}

type InventoryViewResult = {
  search: string;
  setSearch: (search: string) => void;
  selectedItem: Item | null;
  displayItem: Item | null;
  detailOpen: boolean;
  detailStatus: InventoryDetailStatus;
  detailError: string | null;
  actionsDisabled: boolean;
  selectItem: (item: Item | null) => void;
  closeDetail: () => void;
  retryDetail: () => Promise<void>;
};

/** 직원별 재고 화면의 검색·선택·상세 열림을 함께 관리한다. */
export function useInventoryViewState(items: Item[]): InventoryViewResult {
  const employeeId = useCurrentOperator()?.employee_id;
  const scopeKey = employeeId ? `dexcowin_mes_inventory_view:${employeeId}` : "";
  const bootId = getStoredBootId() ?? "";
  const [storedState, setState] = useState<InventoryViewState>(() => readSnapshot(scopeKey, bootId));
  const state = storedState.scopeKey === scopeKey && storedState.bootId === bootId ? storedState : readSnapshot(scopeKey, bootId);
  // 직원 전환 첫 렌더부터 이전 직원의 검색과 선택을 숨긴다.
  if (state !== storedState) setState(state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastItemRef = useRef<{ scopeKey: string; item: Item } | null>(null);
  const query = useItemQuery(state.detailOpen ? state.selectedItemId : null, { refetchOnMount: "always" });
  const queriedItem = query.data?.item_id === state.selectedItemId ? query.data : null;
  const listedItem = items.find((item) => item.item_id === state.selectedItemId) ?? null;
  if (queriedItem) lastItemRef.current = { scopeKey, item: queriedItem };
  const lastItem = lastItemRef.current?.scopeKey === scopeKey && lastItemRef.current.item.item_id === state.selectedItemId ? lastItemRef.current.item : null;
  const displayItem = queriedItem ?? lastItem ?? listedItem;

  const commit = useCallback((patch: Partial<Pick<InventoryViewSnapshot, "search" | "selectedItemId" | "detailOpen">>): void => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    if (!next.scopeKey) return;
    const { scopeKey: key, ...snapshot } = next;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // 저장소가 제한되어도 현재 화면의 조회·선택은 유지한다.
    }
  }, []);
  const setSearch = useCallback((search: string): void => commit({ search }), [commit]);
  const selectItem = useCallback((item: Item | null): void => {
    if (!item) {
      commit({ detailOpen: false });
      return;
    }
    lastItemRef.current = { scopeKey: stateRef.current.scopeKey, item };
    commit({ selectedItemId: item.item_id, detailOpen: true });
  }, [commit]);
  const closeDetail = useCallback((): void => commit({ detailOpen: false }), [commit]);
  const { refetch } = query;
  const retryDetail = useCallback(async (): Promise<void> => { await refetch(); }, [refetch]);

  let detailStatus: InventoryDetailStatus = "loading";
  let detailError: string | null = null;
  if (query.error && state.detailOpen) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    detailStatus = status === 404 ? "not-found" : status === 401 || status === 403 ? "access-error" : "read-error";
    detailError = status === 404 ? "품목을 찾을 수 없습니다." : status === 401 || status === 403
      ? "품목 조회 권한을 확인하지 못했습니다. 로그인 상태를 확인해 주세요."
      : "품목 상세를 불러오지 못했습니다. 다시 시도해 주세요.";
  } else if (queriedItem) {
    detailStatus = queriedItem.deleted_at ? "deleted" : "active";
  }
  return {
    search: state.search, setSearch, selectedItem: displayItem,
    displayItem, detailOpen: state.detailOpen, detailStatus, detailError,
    actionsDisabled: detailStatus !== "active" || (query.isFetching && !query.isFetchedAfterMount),
    selectItem, closeDetail, retryDetail,
  };
}
