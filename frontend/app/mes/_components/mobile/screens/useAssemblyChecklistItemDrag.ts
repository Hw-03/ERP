"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AssemblyChecklistSection } from "@/lib/api/types/assembly-checklists";

type MoveInput = {
  itemId: string;
  targetSectionId: string;
  targetIndex: number;
};

type DragHandlers = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  style: CSSProperties;
};

type DragSource = {
  itemId: string;
  sectionId: string;
};

type DropTarget = {
  itemId: string | null;
  sectionId: string | null;
};

export type UseAssemblyChecklistItemDragResult = {
  dragId: string | null;
  dropTargetItemId: string | null;
  dropTargetSectionId: string | null;
  makeHandlers: (sectionId: string, itemId: string) => DragHandlers;
};

/**
 * 조립 체크리스트 행을 같은 박스 안에서 재정렬하거나 다른 박스로 옮긴다.
 * 드래그 중인 행과 현재 대상만 상태로 노출하고, 저장은 포인터를 놓을 때 한 번만 요청한다.
 */
export function useAssemblyChecklistItemDrag(
  sections: AssemblyChecklistSection[],
  onReorder: (sectionId: string, itemIds: string[]) => void,
  onMove: (input: MoveInput) => void,
): UseAssemblyChecklistItemDragResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const sourceRef = useRef<DragSource | null>(null);
  const targetRef = useRef<DropTarget>({ itemId: null, sectionId: null });
  const pointerStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  function cleanup(): void {
    sourceRef.current = null;
    targetRef.current = { itemId: null, sectionId: null };
    isDraggingRef.current = false;
    setDragId(null);
    setDropTargetItemId(null);
    setDropTargetSectionId(null);
  }

  function updateTargetAtPoint(clientX: number, clientY: number): void {
    const element = document.elementFromPoint(clientX, clientY);
    const sectionElement = element?.closest<HTMLElement>("[data-checklist-section-id]") ?? null;
    const itemElement = element?.closest<HTMLElement>("[data-checklist-item-id]") ?? null;
    const nextSectionId = sectionElement?.dataset.checklistSectionId ?? null;
    const nextItemId = itemElement?.dataset.checklistItemId ?? null;

    if (
      targetRef.current.sectionId === nextSectionId
      && targetRef.current.itemId === nextItemId
    ) return;

    targetRef.current = { sectionId: nextSectionId, itemId: nextItemId };
    setDropTargetSectionId(nextSectionId);
    setDropTargetItemId(nextItemId);
  }

  function finishDrop(): void {
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!source || !target.sectionId || !isDraggingRef.current) return;

    const sourceSection = sections.find((section) => section.section_id === source.sectionId);
    const targetSection = sections.find((section) => section.section_id === target.sectionId);
    const sourceIndex = sourceSection?.items.findIndex((item) => item.item_id === source.itemId) ?? -1;
    if (!sourceSection || !targetSection || sourceIndex < 0) return;

    if (source.sectionId === target.sectionId) {
      if (target.itemId === source.itemId) return;
      const targetIndex = target.itemId
        ? sourceSection.items.findIndex((item) => item.item_id === target.itemId)
        : sourceSection.items.length - 1;
      if (targetIndex < 0 || sourceIndex === targetIndex) return;

      const itemIds = sourceSection.items.map((item) => item.item_id);
      const [movedItemId] = itemIds.splice(sourceIndex, 1);
      if (!movedItemId) return;
      itemIds.splice(target.itemId ? targetIndex : itemIds.length, 0, movedItemId);
      onReorder(source.sectionId, itemIds);
      return;
    }

    const targetIndex = target.itemId
      ? targetSection.items.findIndex((item) => item.item_id === target.itemId)
      : targetSection.items.length;
    if (targetIndex < 0) return;
    onMove({ itemId: source.itemId, targetSectionId: target.sectionId, targetIndex });
  }

  function makeHandlers(sectionId: string, itemId: string): DragHandlers {
    function onPointerDown(event: PointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      sourceRef.current = { sectionId, itemId };
      pointerStartYRef.current = event.clientY;
      isDraggingRef.current = false;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent): void {
      const source = sourceRef.current;
      if (!source || source.itemId !== itemId) return;
      if (!isDraggingRef.current && Math.abs(event.clientY - pointerStartYRef.current) > 5) {
        isDraggingRef.current = true;
        setDragId(itemId);
      }
      if (isDraggingRef.current) updateTargetAtPoint(event.clientX, event.clientY);
    }

    function onPointerUp(event: PointerEvent): void {
      finishDrop();
      cleanup();
    }

    function onPointerCancel(event: PointerEvent): void {
      cleanup();
    }

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: { touchAction: "none" },
    };
  }

  return { dragId, dropTargetItemId, dropTargetSectionId, makeHandlers };
}
