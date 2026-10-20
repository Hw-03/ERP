import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api, type IoBatch, type IoBundle, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { makeClientRequestId } from "@/lib/uuid";
import type { IoInventoryQueryState } from "./types";

interface ReservationContext {
  inventorySnapshot: Item[];
  realtimeRevision: number | null;
  employeeId: string;
  inventoryQueryState?: IoInventoryQueryState;
}

type InventoryBoundary = Pick<IoInventoryQueryState, "queryKey" | "dataUpdateCount">;

/** 새 예약은 해당 변경 이후 성공한 재고 응답에만 가산한다. */
function inventoryIsReady(context: ReservationContext, realtimeFloor: InventoryBoundary | null, awaiting: ReservationContext | null): boolean {
  const query = context.inventoryQueryState;
  if (query && (!query.isSuccess || query.isFetching || query.isInvalidated || query.dataUpdatedAt <= 0 || realtimeFloor?.queryKey === query.queryKey && query.dataUpdateCount <= realtimeFloor.dataUpdateCount)) return false;
  if (!awaiting) return true;
  return query && awaiting.inventoryQueryState
    ? query.queryKey !== awaiting.inventoryQueryState.queryKey || query.dataUpdateCount > awaiting.inventoryQueryState.dataUpdateCount
    : context.inventorySnapshot !== awaiting.inventorySnapshot;
}

export function useIoDraft(draftToRestore?: IoBatch | null, restoreNonce?: number, onReservationChanged?: () => void | Promise<void>, sessionCreationKey?: MutableRefObject<string | null>, reservationContext?: ReservationContext) {
  const [drafting, setDrafting] = useState(false);
  const [savedBatch, setSavedBatch] = useState<IoBatch | null>(null);
  const [latestBatch, setLatestBatch] = useState<IoBatch | null>(null);
  const [reservationSnapshot, setReservationSnapshot] = useState<{ batch: IoBatch; context: ReservationContext } | null>(null);
  const latestContext = useRef(reservationContext);
  const realtimeInventoryFloor = useRef<InventoryBoundary | null>(null);
  const queryState = reservationContext?.inventoryQueryState;
  const previousQueryState = latestContext.current?.inventoryQueryState;
  if (queryState && reservationContext?.realtimeRevision !== latestContext.current?.realtimeRevision) {
    realtimeInventoryFloor.current = {
      queryKey: queryState.queryKey,
      dataUpdateCount: previousQueryState?.queryKey === queryState.queryKey ? previousQueryState.dataUpdateCount : queryState.dataUpdateCount,
    };
  }
  latestContext.current = reservationContext;
  const awaitingInventory = useRef<ReservationContext | null>(null);
  const reservationRead = useRef(0);
  const [reservationRefreshNonce, setReservationRefreshNonce] = useState(0);
  const revisions = useRef(new Map<string, number>());
  const standaloneCreationKey = useRef<string | null>(null);
  const creationKey = sessionCreationKey ?? standaloneCreationKey;
  const busy = useRef(false);
  const generation = useRef(0);

  function observeBatch(batch: IoBatch, afterSave = false): void {
    reservationRead.current += 1;
    if (Number.isInteger(batch.revision)) revisions.current.set(batch.batch_id, batch.revision!);
    else revisions.current.delete(batch.batch_id);
    setSavedBatch(batch);
    setLatestBatch(null);
    const context = latestContext.current;
    awaitingInventory.current = afterSave ? context ?? null : null;
    setReservationSnapshot(context && !afterSave ? { batch, context } : null);
  }

  useEffect(() => {
    generation.current += 1;
    if (draftToRestore) observeBatch(draftToRestore);
    // 재조회 응답은 사용자가 명시적으로 복원하기 전까지 편집 버전을 바꾸지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id, restoreNonce]);

  useEffect(() => {
    const batchId = savedBatch?.batch_id;
    const context = latestContext.current;
    if (!batchId || !context || !inventoryIsReady(context, realtimeInventoryFloor.current, awaitingInventory.current)) return;
    awaitingInventory.current = null;
    let cancelled = false;
    const requestedGeneration = generation.current;
    const requestedRead = ++reservationRead.current;
    // 현재 예약 조회는 편집 입력과 쓰기 요청의 관측 버전에서 분리한다.
    void (async () => {
      try {
        const batch = await api.getBatch(batchId);
        if (!cancelled && requestedGeneration === generation.current && requestedRead === reservationRead.current) {
          setReservationSnapshot({ batch, context });
          if (batch.revision !== savedBatch.revision || batch.status !== savedBatch.status || batch.reservation_status !== savedBatch.reservation_status) setLatestBatch(batch);
        }
      } catch { /* 복원 당시 동일 스냅샷은 보존하되 오래된 재고에 가산하지 않는다. */ }
    })();
    return () => { cancelled = true; };
  }, [savedBatch, reservationContext?.inventorySnapshot, reservationContext?.realtimeRevision, reservationContext?.employeeId, reservationContext?.inventoryQueryState?.queryKey, reservationContext?.inventoryQueryState?.isSuccess, reservationContext?.inventoryQueryState?.isFetching, reservationContext?.inventoryQueryState?.isInvalidated, reservationContext?.inventoryQueryState?.dataUpdatedAt, reservationContext?.inventoryQueryState?.dataUpdateCount, restoreNonce, reservationRefreshNonce]);

  const currentReservationBatch = reservationContext && reservationSnapshot
    && inventoryIsReady(reservationContext, realtimeInventoryFloor.current, awaitingInventory.current)
    && reservationSnapshot.context.inventorySnapshot === reservationContext.inventorySnapshot
    && reservationSnapshot.context.realtimeRevision === reservationContext.realtimeRevision
    && reservationSnapshot.context.inventoryQueryState?.dataUpdateCount === reservationContext.inventoryQueryState?.dataUpdateCount
    && reservationSnapshot.context.inventoryQueryState?.queryKey === reservationContext.inventoryQueryState?.queryKey
    && reservationSnapshot.batch.requester_employee_id === reservationContext.employeeId
    ? reservationSnapshot.batch : null;

  function getRevision(batchId: string): number {
    const revision = revisions.current.get(batchId);
    if (revision === undefined) throw new Error("작업 버전을 확인할 수 없습니다. 작업 중 목록에서 다시 불러오세요.");
    return revision;
  }

  async function refreshAfterFailure(batchId?: string | null): Promise<void> {
    const requestedGeneration = generation.current;
    let inventoryRefreshed = true;
    try { await onReservationChanged?.(); } catch { inventoryRefreshed = false; /* 예약 조회 실패가 원래 명령 오류를 덮지 않는다. */ }
    if (!batchId || requestedGeneration !== generation.current) return;
    const requestedRead = ++reservationRead.current;
    try {
      const batch = await api.getBatch(batchId);
      if (requestedGeneration === generation.current && requestedRead === reservationRead.current) {
        setLatestBatch(batch);
        const context = latestContext.current;
        setReservationSnapshot(inventoryRefreshed && context && inventoryIsReady(context, realtimeInventoryFloor.current, awaitingInventory.current) ? { batch, context } : null);
      }
    } catch { /* 입력과 관측 버전을 보존한다. */ }
  }

  function resetSession(): void {
    generation.current += 1;
    creationKey.current = null;
    setSavedBatch(null);
    setLatestBatch(null);
    setReservationSnapshot(null);
    awaitingInventory.current = null;
  }

  function captureSession(): () => void {
    const key = creationKey.current;
    const batch = savedBatch;
    const snapshot = reservationSnapshot;
    return () => { generation.current += 1; creationKey.current = key; setSavedBatch(batch); setLatestBatch(null); setReservationSnapshot(snapshot); awaitingInventory.current = null; };
  }

  async function submitDraft(batchId: string, employeeId: string) {
    try {
      const result = await api.submitDraft(batchId, employeeId, getRevision(batchId));
      reservationRead.current += 1;
      setReservationSnapshot(null);
      try { await onReservationChanged?.(); } catch { /* 조회 오류가 확정된 제출 결과를 바꾸지 않는다. */ }
      return result;
    }
    catch (error) { await refreshAfterFailure(batchId); throw error; }
  }

  async function deleteDraft(batchId: string, employeeId: string): Promise<void> {
    try {
      await api.deleteDraft(batchId, employeeId, getRevision(batchId));
      reservationRead.current += 1;
      setReservationSnapshot(null);
      try { await onReservationChanged?.(); } catch { /* 조회 오류가 확정된 삭제 결과를 바꾸지 않는다. */ }
    }
    catch (error) { await refreshAfterFailure(batchId); throw error; }
  }

  async function saveDraft(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    reasonCategoryId?: string | null;
    reasonCategory?: string | null;
    supplierId?: string | null;
    batchId?: string | null;
    bundles: IoBundle[];
  }) {
    if (busy.current) throw new Error("작업을 저장 중입니다. 잠시 후 다시 시도하세요.");
    const revision = payload.batchId ? getRevision(payload.batchId) : undefined;
    const savedGeneration = generation.current;
    if (!payload.batchId && !creationKey.current) creationKey.current = makeClientRequestId();
    busy.current = true;
    setDrafting(true);
    try {
      const batch = await api.saveDraft({
        requester_employee_id: payload.employeeId,
        work_type: payload.workType,
        sub_type: payload.subType,
        from_department: payload.fromDepartment || null,
        to_department: payload.toDepartment || null,
        reference_no: payload.referenceNo || null,
        notes: payload.notes || null,
        ...(payload.subType === "defect_quarantine" ? {
          reason_category_id: payload.reasonCategoryId ?? null,
          reason_category: payload.reasonCategory?.trim() || null,
        } : {}),
        supplier_id: payload.supplierId ?? null,
        batch_id: payload.batchId ?? null,
        ...(payload.batchId ? { expected_revision: revision } : { client_request_id: creationKey.current }),
        bundles: payload.bundles,
      });
      if (savedGeneration === generation.current) observeBatch(batch, true);
      try {
        const refresh = onReservationChanged?.();
        if (refresh) {
          await refresh;
          if (savedGeneration === generation.current) {
            if (!latestContext.current?.inventoryQueryState) awaitingInventory.current = null;
            setReservationRefreshNonce((value) => value + 1);
          }
        }
      } catch { /* 이미 확정된 저장은 조회 실패 때문에 실패로 바꾸지 않는다. */ }
      return batch;
    } catch (error) {
      if (savedGeneration === generation.current) await refreshAfterFailure(payload.batchId);
      throw error;
    } finally {
      busy.current = false;
      setDrafting(false);
    }
  }

  async function restoreDraft(employeeId: string, workType: IoWorkType, subType: IoSubType) {
    setDrafting(true);
    try {
      return await api.getDraft(employeeId, workType, subType);
    } finally {
      setDrafting(false);
    }
  }

  return { drafting, saveDraft, restoreDraft, savedBatch, latestBatch, currentReservationBatch, getRevision, observeBatch, resetSession, captureSession, submitDraft, deleteDraft, refreshAfterFailure };
}
