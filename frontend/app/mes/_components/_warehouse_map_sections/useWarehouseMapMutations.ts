"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  warehouseMapApi,
  type WarehouseBox,
  type WarehouseMap,
} from "@/lib/api/warehouse-map";
import { queryKeys } from "@/lib/queries/keys";

type JariTarget = {
  angleId: number;
  row: number;
  layer: number;
  jari: number;
};

type InsertTarget = JariTarget & {
  targetBoxId: string;
  place: "above" | "below";
};

type CoordinatorSnapshot = {
  hasPending: boolean;
  pendingBoxIds: ReadonlySet<string>;
};

type Coordinator = {
  nextOperationId: number;
  owners: Map<string, number>;
  networkPending: number;
  converging: boolean;
  listeners: Set<() => void>;
  snapshot: CoordinatorSnapshot;
};

const coordinators = new WeakMap<QueryClient, Coordinator>();

function getCoordinator(queryClient: QueryClient): Coordinator {
  const existing = coordinators.get(queryClient);
  if (existing) return existing;

  const created: Coordinator = {
    nextOperationId: 1,
    owners: new Map(),
    networkPending: 0,
    converging: false,
    listeners: new Set(),
    snapshot: { hasPending: false, pendingBoxIds: new Set() },
  };
  coordinators.set(queryClient, created);
  return created;
}

function boxOwnerKey(boxId: string): string {
  return `box:${boxId}`;
}

function jariOwnerKey(target: JariTarget): string {
  return `jari:${target.angleId}:${target.row}:${target.layer}:${target.jari}`;
}

function boxJariOwnerKey(box: WarehouseBox): string {
  return jariOwnerKey({
    angleId: box.angle_id,
    row: box.row_no,
    layer: box.layer_no,
    jari: box.jari_index,
  });
}

function publish(coordinator: Coordinator): void {
  const pendingBoxIds = new Set<string>();
  coordinator.owners.forEach((_operationId, key) => {
    if (key.startsWith("box:")) pendingBoxIds.add(key.slice("box:".length));
  });
  coordinator.snapshot = {
    hasPending: coordinator.owners.size > 0,
    pendingBoxIds,
  };
  coordinator.listeners.forEach((listener) => listener());
}

function reserve(coordinator: Coordinator, ownerKeys: string[]): number | null {
  const uniqueOwnerKeys = Array.from(new Set(ownerKeys));
  if (coordinator.converging || uniqueOwnerKeys.some((key) => coordinator.owners.has(key))) {
    return null;
  }

  const operationId = coordinator.nextOperationId++;
  for (const key of uniqueOwnerKeys) coordinator.owners.set(key, operationId);
  coordinator.networkPending += 1;
  publish(coordinator);
  return operationId;
}

function stillOwnsBox(coordinator: Coordinator, operationId: number, boxId: string): boolean {
  return coordinator.owners.get(boxOwnerKey(boxId)) === operationId;
}

function releaseBatch(coordinator: Coordinator): void {
  coordinator.owners.clear();
  coordinator.converging = false;
  publish(coordinator);
}

async function settleOperation(
  queryClient: QueryClient,
  coordinator: Coordinator,
): Promise<void> {
  coordinator.networkPending -= 1;
  if (coordinator.networkPending !== 0 || coordinator.converging) return;

  coordinator.converging = true;
  publish(coordinator);
  try {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.warehouseMap.map(),
      exact: true,
      refetchType: "none",
    });
    await queryClient.fetchQuery({
      queryKey: queryKeys.warehouseMap.map(),
      queryFn: () => warehouseMapApi.getMap(),
      staleTime: 0,
    });
  } catch {
    // QueryClient가 오류 상태를 보존한다. 잠금은 해제해 활성 observer의 재시도를 허용한다.
  } finally {
    releaseBatch(coordinator);
  }
}

function snapshotBoxes(map: WarehouseMap, boxIds: readonly string[]): Map<string, WarehouseBox> {
  const requested = new Set(boxIds);
  return new Map(
    map.boxes
      .filter((box) => requested.has(box.box_id))
      .map((box) => [box.box_id, box] as const),
  );
}

function rollbackOwnedBoxes(
  queryClient: QueryClient,
  coordinator: Coordinator,
  operationId: number,
  previousBoxes: ReadonlyMap<string, WarehouseBox>,
): void {
  queryClient.setQueryData<WarehouseMap>(queryKeys.warehouseMap.map(), (current) => {
    if (!current) return current;
    return {
      ...current,
      boxes: current.boxes.map((box) => {
        const previous = previousBoxes.get(box.box_id);
        return previous && stillOwnsBox(coordinator, operationId, box.box_id) ? previous : box;
      }),
    };
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const PENDING_CONFLICT_MESSAGE = "해당 박스나 자리를 다른 이동이 처리 중입니다.";

export function useWarehouseMapMutations({
  onStatusChange,
}: {
  onStatusChange?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  const coordinator = getCoordinator(queryClient);
  const callbackRef = useRef(onStatusChange);
  const mountedRef = useRef(false);
  callbackRef.current = onStatusChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const snapshot = useSyncExternalStore(
    (listener) => {
      coordinator.listeners.add(listener);
      return () => coordinator.listeners.delete(listener);
    },
    () => coordinator.snapshot,
    () => coordinator.snapshot,
  );

  async function moveBox(boxId: string, target: JariTarget): Promise<boolean> {
    const current = queryClient.getQueryData<WarehouseMap>(queryKeys.warehouseMap.map());
    const box = current?.boxes.find((candidate) => candidate.box_id === boxId);
    if (!current || !box) return false;

    const operationId = reserve(coordinator, [
      boxOwnerKey(boxId),
      boxJariOwnerKey(box),
      jariOwnerKey(target),
    ]);
    if (operationId === null) {
      if (mountedRef.current) callbackRef.current?.(PENDING_CONFLICT_MESSAGE);
      return false;
    }

    const previousBoxes = snapshotBoxes(current, [boxId]);
    try {
      await queryClient.cancelQueries({ queryKey: queryKeys.warehouseMap.map(), exact: true });
      queryClient.setQueryData<WarehouseMap>(queryKeys.warehouseMap.map(), (latest) => {
        if (!latest || !stillOwnsBox(coordinator, operationId, boxId)) return latest;
        const targetMax = latest.boxes
          .filter((candidate) =>
            candidate.box_id !== boxId
            && candidate.angle_id === target.angleId
            && candidate.row_no === target.row
            && candidate.layer_no === target.layer
            && candidate.jari_index === target.jari)
          .reduce((maximum, candidate) => Math.max(maximum, candidate.stack_order), 0);
        return {
          ...latest,
          boxes: latest.boxes.map((candidate) => candidate.box_id === boxId
            ? {
                ...candidate,
                angle_id: target.angleId,
                row_no: target.row,
                layer_no: target.layer,
                jari_index: target.jari,
                stack_order: targetMax + 1,
              }
            : candidate),
        };
      });

      await warehouseMapApi.moveBox(boxId, {
        angle_id: target.angleId,
        row_no: target.row,
        layer_no: target.layer,
        jari_index: target.jari,
      });
      return true;
    } catch (error) {
      rollbackOwnedBoxes(queryClient, coordinator, operationId, previousBoxes);
      if (mountedRef.current) {
        callbackRef.current?.(errorMessage(error, "박스 이동에 실패했습니다."));
      }
      return false;
    } finally {
      await settleOperation(queryClient, coordinator);
    }
  }

  async function insertBox(boxId: string, target: InsertTarget): Promise<boolean> {
    const current = queryClient.getQueryData<WarehouseMap>(queryKeys.warehouseMap.map());
    const dragged = current?.boxes.find((candidate) => candidate.box_id === boxId);
    if (!current || !dragged) return false;

    const jariBoxes = current.boxes
      .filter((candidate) =>
        candidate.box_id !== boxId
        && candidate.angle_id === target.angleId
        && candidate.row_no === target.row
        && candidate.layer_no === target.layer
        && candidate.jari_index === target.jari)
      .sort((left, right) => left.stack_order - right.stack_order);
    const targetIndex = jariBoxes.findIndex((candidate) => candidate.box_id === target.targetBoxId);
    if (targetIndex < 0) return false;

    const insertIndex = target.place === "above" ? targetIndex + 1 : targetIndex;
    const ordered = [
      ...jariBoxes.slice(0, insertIndex),
      dragged,
      ...jariBoxes.slice(insertIndex),
    ];
    const boxIds = ordered.map((candidate) => candidate.box_id);
    const operationId = reserve(coordinator, [
      ...boxIds.map(boxOwnerKey),
      boxJariOwnerKey(dragged),
      jariOwnerKey(target),
    ]);
    if (operationId === null) {
      if (mountedRef.current) callbackRef.current?.(PENDING_CONFLICT_MESSAGE);
      return false;
    }

    const previousBoxes = snapshotBoxes(current, boxIds);
    const orderByBoxId = new Map(boxIds.map((id, index) => [id, index] as const));
    try {
      await queryClient.cancelQueries({ queryKey: queryKeys.warehouseMap.map(), exact: true });
      queryClient.setQueryData<WarehouseMap>(queryKeys.warehouseMap.map(), (latest) => {
        if (!latest) return latest;
        return {
          ...latest,
          boxes: latest.boxes.map((candidate) => {
            const stackOrder = orderByBoxId.get(candidate.box_id);
            if (stackOrder === undefined || !stillOwnsBox(coordinator, operationId, candidate.box_id)) {
              return candidate;
            }
            return {
              ...candidate,
              angle_id: target.angleId,
              row_no: target.row,
              layer_no: target.layer,
              jari_index: target.jari,
              stack_order: stackOrder,
            };
          }),
        };
      });

      await warehouseMapApi.restackJari({
        angle_id: target.angleId,
        row_no: target.row,
        layer_no: target.layer,
        jari_index: target.jari,
        box_ids: boxIds,
      });
      return true;
    } catch (error) {
      rollbackOwnedBoxes(queryClient, coordinator, operationId, previousBoxes);
      if (mountedRef.current) {
        callbackRef.current?.(errorMessage(error, "스택 순서 변경에 실패했습니다."));
      }
      return false;
    } finally {
      await settleOperation(queryClient, coordinator);
    }
  }

  return {
    hasPending: snapshot.hasPending,
    pendingBoxIds: snapshot.pendingBoxIds,
    moveBox,
    insertBox,
  };
}
