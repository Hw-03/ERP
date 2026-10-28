"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Network } from "lucide-react";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useBomQuery, useBomWhereUsedQuery } from "@/lib/queries/useBomQuery";
import { queryKeys } from "@/lib/queries/keys";
import { beginBomMutation } from "@/lib/queries/bomMutationSync";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { itemsApi } from "@/lib/api/items";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../../common";
import { AdminPageHeader } from "../_admin_primitives";
import { BomDeptTabs } from "./BomDeptTabs";
import { BomParentList } from "./BomParentList";
import { BomChildAddBox } from "./BomChildAddBox";
import { BomEditPanel } from "./BomEditPanel";
import { BomReviewModal } from "./BomReviewModal";
import { BomStatsRow, type StatusFilter } from "./BomStatsRow";
import { BomParentHeader } from "./BomParentHeader";
import { BomWhereUsedPanel } from "./BomWhereUsedPanel";
import { BomUnmatchedRawsDrawer } from "./BomUnmatchedRawsDrawer";
import { bomStatusOf, DEPT_LETTERS, deptOf, stageOf, type BomDeptFilter } from "./bomDept";
import { useAdminReadState } from "../_admin_primitives/AdminReadState";
import transitions from "../AdminTransitions.module.css";
import { useAdminSelectionFade } from "../useAdminSelectionFade";
import { BomViewModeControl } from "./BomViewModeControl";
import { BomUnmatchedRawsSkeleton } from "./BomUnmatchedRawsDrawer";
import { useAdminSessionState } from "../../_admin_hooks/useAdminSessionState";

interface Props {
  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

type Mode = "edit" | "whereused";
type DeleteRequest = { bomId: string; childName: string; parent: Item };
type BomWorkbenchHistoryState = { dept: BomDeptFilter; mode: Mode; parentId: string };

const BOM_WORKBENCH_HISTORY_KEY = "bomWorkbench";

export function readBomWorkbenchHistoryState(value: unknown): BomWorkbenchHistoryState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[BOM_WORKBENCH_HISTORY_KEY];
  if (!candidate || typeof candidate !== "object") return null;
  const { dept, mode, parentId } = candidate as Record<string, unknown>;
  const validDept = dept === "ALL" || DEPT_LETTERS.includes(dept as (typeof DEPT_LETTERS)[number]);
  if (!validDept || (mode !== "edit" && mode !== "whereused") || typeof parentId !== "string") return null;
  return { dept: dept as BomDeptFilter, mode, parentId };
}

function writeBomWorkbenchHistoryState(method: "push" | "replace", state: BomWorkbenchHistoryState): void {
  const current = window.history.state;
  const merged = {
    ...(current && typeof current === "object" ? current : {}),
    [BOM_WORKBENCH_HISTORY_KEY]: state,
  };
  if (method === "push") window.history.pushState(merged, "");
  else window.history.replaceState(merged, "");
}

function isSameBomWorkbenchHistoryState(
  left: BomWorkbenchHistoryState | null,
  right: BomWorkbenchHistoryState,
): boolean {
  return left?.dept === right.dept && left.mode === right.mode && left.parentId === right.parentId;
}

function candidatesFor(items: Item[], dept: BomDeptFilter, mode: Mode): Item[] {
  return items.filter((item) => {
    if (item.deleted_at) return false;
    if (dept !== "ALL" && item.process_type_code?.[0] !== dept) return false;
    return mode === "whereused" || stageOf(item.process_type_code) !== "R";
  });
}

function compareBomChildren(left: BOMEntry, right: BOMEntry, items: Map<string, Item>): number {
  // backend.services.bom.bom_child_item_ordering과 같은 부서·단계·번호·코드·ID 순서.
  const a = items.get(left.child_item_id);
  const b = items.get(right.child_item_id);
  const rank = (value: string | undefined, order: string): number => {
    const index = value ? order.indexOf(value) : -1;
    return index < 0 ? order.length : index;
  };
  const compareText = (first: string, second: string): number => first < second ? -1 : first > second ? 1 : 0;
  return rank(a?.process_type_code?.[0], "THVNAP") - rank(b?.process_type_code?.[0], "THVNAP") ||
    rank(a?.process_type_code?.[1], "FAR") - rank(b?.process_type_code?.[1], "FAR") ||
    Number(a?.serial_no == null) - Number(b?.serial_no == null) ||
    (a?.serial_no ?? 0) - (b?.serial_no ?? 0) ||
    Number(a?.mes_code == null) - Number(b?.mes_code == null) ||
    compareText(a?.mes_code ?? "", b?.mes_code ?? "") ||
    compareText(left.child_item_id, right.child_item_id);
}

export function BomWorkbench({
  items,
  setItems,
  allBomRows,
  refreshItems,
  onStatusChange,
  onError,
}: Props) {
  const initialRead = useAdminReadState("items", "bom");
  const queryClient = useQueryClient();
  const [initialNavigation] = useState(() => typeof window === "undefined" ? null : readBomWorkbenchHistoryState(window.history.state));
  const [dept, setDept] = useState<BomDeptFilter>(initialNavigation?.dept ?? "ALL");
  const [parentId, setParentId] = useState(initialNavigation?.parentId ?? "");
  const [mode, setMode] = useState<Mode>(initialNavigation?.mode ?? "edit");
  const bomQuery = useBomQuery(parentId, { enabled: mode === "edit" && !initialRead.loading && !initialRead.error });
  const whereUsedQuery = useBomWhereUsedQuery(parentId, { enabled: mode === "whereused" && !initialRead.loading && !initialRead.error });
  const bomRows = bomQuery.data ?? EMPTY_BOM_ROWS;
  const whereUsedRows = whereUsedQuery.data ?? EMPTY_WHERE_USED_ROWS;
  const [statusFilter, setStatusFilter] = useAdminSessionState<StatusFilter>("bom.status", "ALL");
  const [reviewParentId, setReviewParentId] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const mutationParentIdsRef = useRef(new Set<string>());
  const [mutationParentIds, setMutationParentIds] = useState<Set<string>>(new Set());
  const [unmatchedStatusBusyItemIds, setUnmatchedStatusBusyItemIds] = useState<Set<string>>(new Set());
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const viewFadeRef = useAdminSelectionFade(mode);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyValidationDeferred, setHistoryValidationDeferred] = useState(items.length === 0 && !!initialNavigation?.parentId);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const restore = (state: unknown): void => {
      const restored = readBomWorkbenchHistoryState(state);
      if (!restored) return;
      setDept(restored.dept);
      setMode(restored.mode);
      setParentId(restored.parentId);
      setHistoryValidationDeferred(itemsRef.current.length === 0 && restored.parentId !== "");
    };
    restore(window.history.state);
    setHistoryReady(true);
    const handlePopState = (event: PopStateEvent): void => restore(event.state);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeItems = useMemo(() => items.filter((item) => !item.deleted_at), [items]);

  const completedSet = useMemo(
    () => new Set(activeItems.filter((i) => i.bom_completed_at).map((i) => i.item_id)),
    [activeItems],
  );
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allBomRows) m.set(r.parent_item_id, (m.get(r.parent_item_id) ?? 0) + 1);
    return m;
  }, [allBomRows]);

  // 현재 부서의 부모 후보 (R 단계 제외, "ALL"일 때는 부서 필터 스킵)
  const parentCandidates = useMemo(
    () => candidatesFor(activeItems, dept, "edit"),
    [activeItems, dept],
  );

  // 4-state KPI
  const stats = useMemo(() => {
    let done = 0;
    let wip = 0;
    let todo = 0;
    for (const i of parentCandidates) {
      const s = bomStatusOf(i.item_id, completedSet, childCountMap);
      if (s === "done") done++;
      else if (s === "wip") wip++;
      else todo++;
    }
    return { total: parentCandidates.length, done, wip, todo };
  }, [parentCandidates, completedSet, childCountMap]);

  // 첫 부모 자동 선택 (부서/모드 바뀔 때, "ALL"일 때는 부서 필터 스킵)
  const modeCandidates = useMemo(() => candidatesFor(activeItems, dept, mode), [activeItems, dept, mode]);

  useEffect(() => {
    if (!historyReady) return;
    if (historyValidationDeferred && items.length === 0) return;
    if (historyValidationDeferred) setHistoryValidationDeferred(false);
    const stableParentId = parentId && modeCandidates.some((candidate) => candidate.item_id === parentId)
      ? parentId
      : modeCandidates[0]?.item_id ?? "";
    const stableState = { dept, mode, parentId: stableParentId };
    if (stableParentId !== parentId) setParentId(stableParentId);
    if (!isSameBomWorkbenchHistoryState(readBomWorkbenchHistoryState(window.history.state), stableState)) {
      writeBomWorkbenchHistoryState("replace", stableState);
    }
  }, [dept, historyReady, historyValidationDeferred, items.length, mode, modeCandidates, parentId]);

  function handleDeptChange(next: BomDeptFilter): void {
    if (next === dept) return;
    const nextParentId = candidatesFor(activeItems, next, mode)[0]?.item_id ?? "";
    writeBomWorkbenchHistoryState("push", { dept: next, mode, parentId: nextParentId });
    setDept(next);
    setParentId(nextParentId);
  }

  function handleModeChange(next: Mode): void {
    if (next === mode) return;
    const nextCandidates = candidatesFor(activeItems, dept, next);
    const nextParentId = nextCandidates.some((candidate) => candidate.item_id === parentId)
      ? parentId
      : nextCandidates[0]?.item_id ?? "";
    writeBomWorkbenchHistoryState("push", { dept, mode: next, parentId: nextParentId });
    setMode(next);
    setParentId(nextParentId);
  }

  function handleParentSelect(nextParentId: string): void {
    if (nextParentId === parentId) return;
    writeBomWorkbenchHistoryState("push", { dept, mode, parentId: nextParentId });
    setParentId(nextParentId);
  }

  function handleWhereUsedParentSelect(nextParentId: string): void {
    const nextParent = activeItems.find((item) => item.item_id === nextParentId);
    if (!nextParent) {
      const fallbackParentId = candidatesFor(activeItems, dept, "edit")[0]?.item_id ?? "";
      const fallbackState = { dept, mode: "edit" as const, parentId: fallbackParentId };
      if (!isSameBomWorkbenchHistoryState(readBomWorkbenchHistoryState(window.history.state), fallbackState)) {
        writeBomWorkbenchHistoryState("replace", fallbackState);
      }
      setMode("edit");
      setParentId(fallbackParentId);
      return;
    }
    const nextDept = dept === "ALL" ? dept : deptOf(nextParent?.process_type_code) ?? dept;
    writeBomWorkbenchHistoryState("push", { dept: nextDept, mode: "edit", parentId: nextParentId });
    setDept(nextDept);
    setMode("edit");
    setParentId(nextParentId);
  }

  const parent = useMemo(
    () => activeItems.find((i) => i.item_id === parentId) ?? null,
    [activeItems, parentId],
  );
  const isCompleted = parent ? completedSet.has(parent.item_id) : false;
  const isMutating = mutationParentIds.has(parentId);
  const selectingParent = !parent && modeCandidates.length > 0;
  const bomError = bomQuery.data === undefined && !bomQuery.isFetching ? bomQuery.error?.message : undefined;
  const whereUsedError = whereUsedQuery.data === undefined && !whereUsedQuery.isFetching ? whereUsedQuery.error?.message : undefined;
  const bomRead = {
    loading: initialRead.loading || selectingParent || (!!parentId && bomQuery.data === undefined && !bomError),
    error: initialRead.error ?? bomError,
    retry: initialRead.error ? initialRead.retry : (): void => { void bomQuery.refetch(); },
  };
  const whereUsedRead = {
    loading: initialRead.loading || selectingParent || (!!parentId && whereUsedQuery.data === undefined && !whereUsedError),
    error: initialRead.error ?? whereUsedError,
    retry: initialRead.error ? initialRead.retry : (): void => { void whereUsedQuery.refetch(); },
  };

  const rawItems = useMemo(
    () =>
      activeItems.filter((i) => {
        if (dept !== "ALL" && i.process_type_code?.[0] !== dept) return false;
        return stageOf(i.process_type_code) === "R";
      }),
    [activeItems, dept],
  );
  const childIdSet = useMemo(
    () => new Set(allBomRows.map((r) => r.child_item_id)),
    [allBomRows],
  );

  /** 서버에서 확정된 행만 기존 캐시에 반영하고 전체 목록의 품목 메타데이터를 보존한다. */
  function applySavedRow(targetParentId: string, saved: BOMEntry): void {
    const itemMap = new Map(itemsRef.current.map((item) => [item.item_id, item]));
    queryClient.setQueryData<BOMEntry[]>(queryKeys.bom.detail(targetParentId), (current) => {
      if (!current) return undefined;
      if (current.some((entry) => entry.bom_id === saved.bom_id)) {
        return current.map((entry) => entry.bom_id === saved.bom_id ? saved : entry);
      }
      const next = [...current, saved];
      // 검색·limit으로 정렬 정보가 빠진 기존 행은 서버 재조회 전까지 현재 위치를 보존한다.
      return next.every((entry) => itemMap.has(entry.child_item_id))
        ? next.sort((a, b) => compareBomChildren(a, b, itemMap)) : next;
    });
    queryClient.setQueryData<BOMDetailEntry[]>(queryKeys.bom.list(), (current) => {
      if (!current) return undefined;
      if (current.some((entry) => entry.bom_id === saved.bom_id)) {
        return current.map((entry) => entry.bom_id === saved.bom_id
          ? { ...entry, quantity: saved.quantity, unit: saved.unit } : entry);
      }
      const savedParent = itemMap.get(targetParentId);
      const savedChild = itemMap.get(saved.child_item_id);
      if (!savedParent || !savedChild) return current;
      const detailed: BOMDetailEntry = { ...saved,
        parent_item_name: savedParent.item_name, parent_mes_code: savedParent.mes_code ?? null,
        child_item_name: savedChild.item_name, child_mes_code: savedChild.mes_code ?? null,
      };
      return [...current, detailed];
    });
  }

  /** 같은 부모의 중복 요청은 동기적으로 차단하고 조회 재동기화는 저장 잠금 밖에서 수행한다. */
  async function saveForParent<T>(
    target: Item,
    request: () => Promise<T>,
    apply: (result: T) => void,
    successMessage: string,
    failureMessage: string,
  ): Promise<boolean> {
    const targetId = target.item_id;
    if (mutationParentIdsRef.current.has(targetId)) return false;
    mutationParentIdsRef.current.add(targetId);
    setMutationParentIds(new Set(mutationParentIdsRef.current));
    const mutation = beginBomMutation(queryClient);
    let serverSaved = false;
    try {
      const result = await request();
      serverSaved = true;
      await mutation.applyServerResult(() => apply(result));
      onStatusChange(successMessage);
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : failureMessage);
      return false;
    } finally {
      mutationParentIdsRef.current.delete(targetId);
      setMutationParentIds(new Set(mutationParentIdsRef.current));
      void mutation.finish().catch(() => onErrorRef.current(serverSaved
        ? "저장됐지만 최신 목록 조회에 실패했습니다." : "최신 목록 조회에 실패했습니다."));
    }
  }

  async function handleAdd(childId: string, childName: string, qty: number): Promise<boolean> {
    if (!parent) return false;
    if (!Number.isFinite(qty) || qty <= 0) {
      onError("수량은 0보다 커야 합니다.");
      return false;
    }
    return saveForParent(parent,
      () => api.createBOM({
        parent_item_id: parent.item_id,
        child_item_id: childId,
        quantity: qty,
        unit: "EA",
      }), (saved) => applySavedRow(parent.item_id, saved), `"${childName}" 을(를) 추가했습니다.`, "추가 실패",
    );
  }

  async function handleSaveQty(bomId: string, qty: number): Promise<boolean> {
    if (!parent) return false;
    return saveForParent(parent, () => api.updateBOM(bomId, { quantity: qty }), (saved) => applySavedRow(parent.item_id, saved),
      "수량을 변경했습니다.", "수량 변경 실패");
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteRequest) return;
    const target = deleteRequest;
    if (mutationParentIdsRef.current.has(target.parent.item_id)) return;
    setDeleteBusy(true);
    try {
      const ok = await saveForParent(target.parent, () => api.deleteBOM(target.bomId), () => {
        queryClient.setQueryData<BOMEntry[]>(queryKeys.bom.detail(target.parent.item_id),
          (current) => current?.filter((entry) => entry.bom_id !== target.bomId));
        queryClient.setQueryData<BOMDetailEntry[]>(queryKeys.bom.list(),
          (current) => current?.filter((entry) => entry.bom_id !== target.bomId));
      }, `"${target.childName}" 을(를) 삭제했습니다.`, "삭제 실패");
      if (ok) setDeleteRequest((current) => current === target ? null : current);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleToggleCompletion(completed: boolean): Promise<boolean> {
    if (!parent) return false;
    const targetId = parent.item_id;
    return saveForParent(parent, () => api.updateBomCompletion(targetId, completed), (saved) => {
      const merge = (item: Item): Item => item.item_id === targetId ? {
        ...item, bom_completed_at: saved.bom_completed_at, updated_at: saved.updated_at,
      } : item;
      setItems((current) => current.map(merge));
      queryClient.setQueriesData<Item[]>({ queryKey: [...queryKeys.items.all, "list"] },
        (current) => current?.map(merge));
      queryClient.setQueryData<Item>(queryKeys.items.detail(targetId), (current) => current ? merge(current) : undefined);
    }, `"${parent.item_name}" ${completed ? "완료 처리됨" : "완료 해제됨"}`, "완료 상태 변경 실패");
  }

  async function handleUnmatchedStatusChange(itemId: string, status: Item["bom_unmatched_status"]): Promise<void> {
    const item = items.find((candidate) => candidate.item_id === itemId);
    if (!item) return;
    setUnmatchedStatusBusyItemIds((current) => new Set(current).add(itemId));
    try {
      const updated = await itemsApi.updateBomUnmatchedStatus(itemId, status);
      setItems((current) => current.map((candidate) => candidate.item_id === itemId ? updated : candidate));
      try {
        await refreshItems();
        const label = status === "DISUSED" ? "불용" : status === "HOLD" ? "보류" : status === "DUPLICATE" ? "중복" : "미처리";
        onStatusChange(
          status ? `"${item.item_name}" ${label} 처리됨` : `"${item.item_name}" 미처리 상태로 되돌렸습니다.`,
        );
      } catch {
        onError("상태는 저장됐지만 목록 새로고침에 실패했습니다.");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "미배치 원자재 상태 변경 실패");
    } finally {
      setUnmatchedStatusBusyItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminPageHeader
        icon={Network}
        title="BOM 관리"
        summary={
          mode === "edit" ? (
            <BomStatsRow
              loading={initialRead.loading} unavailable={!!initialRead.error}
              total={stats.total}
              done={stats.done}
              wip={stats.wip}
              todo={stats.todo}
              active={statusFilter}
              onChange={setStatusFilter}
              placement="header"
            />
          ) : undefined
        }
        actions={<BomViewModeControl mode={mode} onChange={handleModeChange} />}
      />

      {/* 메인: 좌(상위) | 중(자식추가) | 우(현재구성) */}
      <div
        ref={viewFadeRef}
        className={`grid min-h-0 flex-1 gap-3 ${transitions.selection}`}
        data-mode={mode}
        style={{
          display: mode === "edit" && unmatchedOpen ? "none" : undefined,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <BomParentList
            dept={dept}
            departmentFilters={<BomDeptTabs value={dept} onChange={handleDeptChange} />}
            items={activeItems}
            allBomRows={allBomRows}
            completedSet={completedSet}
            statusFilter={statusFilter}
            selectedId={parentId}
            onSelect={handleParentSelect}
            mode={mode}
          />
        </div>

        {mode === "edit" ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {parent || bomRead.loading || bomRead.error ? (
                <BomChildAddBox
                  read={bomRead}
                  parent={parent}
                  bomRows={bomRows}
                  items={items}
                  onAdd={handleAdd}
                  isLocked={isCompleted}
                  isBusy={isMutating}
                />
              ) : (
                <div
                  className="flex min-h-0 flex-1 flex-col rounded-2xl border"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <EmptyState
                    variant="no-data"
                    illustrated
                    title="좌측에서 상위 품목을 먼저 선택하세요"
                    description="선택한 품목의 하위 구성품을 이곳에서 추가할 수 있습니다."
                  />
                </div>
              )}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <BomEditPanel
                parentHeader={<BomParentHeader
                  embedded
                  loading={bomRead.loading}
                  unavailable={!!bomRead.error}
                  parent={parent}
                  mode="edit"
                  childCount={bomRows.length}
                  isCompleted={isCompleted}
                  onOpenReview={() => { if (!mutationParentIdsRef.current.has(parentId)) setReviewParentId(parentId); }}
                />}
                read={bomRead}
                parent={parent}
                bomRows={bomRows}
                items={items}
                onSaveQty={handleSaveQty}
                onRequestDelete={(row, childName) => {
                  if (parent) setDeleteRequest({ bomId: row.bom_id, childName, parent });
                }}
                isLocked={isCompleted}
                isBusy={isMutating}
              />
            </div>
          </>
        ) : (
          <div className="col-span-2 flex min-h-0 min-w-0 flex-1 flex-col">
            <BomWhereUsedPanel
              parentHeader={<BomParentHeader
                embedded
                loading={whereUsedRead.loading}
                unavailable={!!whereUsedRead.error}
                parent={parent}
                mode="whereused"
                childCount={whereUsedRows.length}
                isCompleted={isCompleted}
                onOpenReview={() => setReviewParentId(parentId)}
              />}
              read={whereUsedRead}
              selected={parent}
              rows={whereUsedRows}
              items={items}
              onSelectParent={handleWhereUsedParentSelect}
            />
          </div>
        )}
      </div>

      {/* 하단: 미배치 원자재 (편집 모드에서만) */}
      {mode === "edit" && (initialRead.loading || initialRead.error ? <BomUnmatchedRawsSkeleton /> : (
        <BomUnmatchedRawsDrawer
          open={unmatchedOpen}
          onOpenChange={setUnmatchedOpen}
          rawItems={rawItems}
          childIdSet={childIdSet}
          busyItemIds={unmatchedStatusBusyItemIds}
          onStatusChange={handleUnmatchedStatusChange}
        />
      ))}

      {/* 검토 · 완료 모달 */}
      {reviewParentId === parentId && parent && (
        <BomReviewModal
          key={parentId}
          parent={parent}
          rows={bomRows}
          items={items}
          isCompleted={isCompleted}
          onClose={() => setReviewParentId((current) => current === parentId ? null : current)}
          onConfirm={handleToggleCompletion}
        />
      )}

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        open={deleteRequest !== null}
        title="BOM 자식 품목 삭제"
        tone="danger"
        onClose={() => setDeleteRequest(null)}
        onConfirm={handleDeleteConfirm}
        busy={deleteBusy}
        confirmLabel="삭제"
      >
        {deleteRequest && (
          <div className="text-sm" style={{ color: LEGACY_COLORS.muted }}>
            <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
              {deleteRequest.childName}
            </span>
            <span> 을(를) 이 BOM 에서 제거합니다.</span>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

const EMPTY_BOM_ROWS: BOMEntry[] = [];
const EMPTY_WHERE_USED_ROWS: BOMDetailEntry[] = [];
