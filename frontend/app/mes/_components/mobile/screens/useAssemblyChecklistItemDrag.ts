"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AssemblyChecklistSection } from "@/lib/api/types/assembly-checklists";

type DropPosition = "before" | "after" | "end" | null;

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
  position: DropPosition;
  sectionId: string | null;
};

export type UseAssemblyChecklistItemDragResult = {
  dragId: string | null;
  dropPosition: DropPosition;
  dropTargetItemId: string | null;
  dropTargetSectionId: string | null;
  makeHandlers: (sectionId: string, itemId: string) => DragHandlers;
};

/**
 * 정렬 모드에서 항목의 같은 박스 재정렬과 다른 박스 이동을 처리한다.
 * 드롭 행의 상·하단을 구분해 삽입 위치를 명확하게 유지한다.
 */
export function useAssemblyChecklistItemDrag(
  sections: AssemblyChecklistSection[],
  onReorder: (sectionId: string, itemIds: string[], itemId: string) => void,
  onMove: (input: MoveInput) => void,
): UseAssemblyChecklistItemDragResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const sourceRef = useRef<DragSource | null>(null);
  const targetRef = useRef<DropTarget>({ itemId: null, position: null, sectionId: null });
  const pointerStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  function cleanup(): void {
    sourceRef.current = null;
    targetRef.current = { itemId: null, position: null, sectionId: null };
    isDraggingRef.current = false;
    setDragId(null);
    setDropTargetItemId(null);
    setDropTargetSectionId(null);
    setDropPosition(null);
  }

  function updateTargetAtPoint(clientX: number, clientY: number): void {
    const element = document.elementFromPoint(clientX, clientY);
    const sectionElement = element?.closest<HTMLElement>("[data-checklist-section-id]") ?? null;
    const itemElement = element?.closest<HTMLElement>("[data-checklist-item-id]") ?? null;
    const sectionId = sectionElement?.dataset.checklistSectionId ?? null;
    const itemId = itemElement?.dataset.checklistItemId ?? null;
    const rect = itemElement?.getBoundingClientRect();
    const position: DropPosition = itemId && rect
      ? clientY < rect.top + rect.height / 2 ? "before" : "after"
      : sectionId ? "end" : null;

    if (
      targetRef.current.sectionId === sectionId
      && targetRef.current.itemId === itemId
      && targetRef.current.position === position
    ) return;

    targetRef.current = { itemId, position, sectionId };
    setDropTargetSectionId(sectionId);
    setDropTargetItemId(itemId);
    setDropPosition(position);
  }

  function finishDrop(): void {
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!source || !target.sectionId || !isDraggingRef.current) return;

    const sourceSection = sections.find((section) => section.section_id === source.sectionId);
    const targetSection = sections.find((section) => section.section_id === target.sectionId);
    if (!sourceSection || !targetSection) return;

    if (source.sectionId === target.sectionId) {
      if (target.itemId === source.itemId) return;
      const itemIds = sourceSection.items.map((item) => item.item_id);
      const sourceIndex = itemIds.indexOf(source.itemId);
      if (sourceIndex < 0) return;
      const [movedItemId] = itemIds.splice(sourceIndex, 1);
      if (!movedItemId) return;
      const targetIndex = target.itemId ? itemIds.indexOf(target.itemId) : itemIds.length;
      if (targetIndex < 0) return;
      const insertionIndex = target.itemId && target.position === "after" ? targetIndex + 1 : targetIndex;
      itemIds.splice(insertionIndex, 0, movedItemId);
      if (itemIds.every((itemId, index) => itemId === sourceSection.items[index]?.item_id)) return;
      onReorder(source.sectionId, itemIds, source.itemId);
      return;
    }

    const targetItemIndex = target.itemId
      ? targetSection.items.findIndex((item) => item.item_id === target.itemId)
      : targetSection.items.length;
    if (targetItemIndex < 0) return;
    const targetIndex = target.itemId && target.position === "after" ? targetItemIndex + 1 : targetItemIndex;
    onMove({ itemId: source.itemId, targetSectionId: target.sectionId, targetIndex });
  }

  function makeHandlers(sectionId: string, itemId: string): DragHandlers {
    function onPointerDown(event: PointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      sourceRef.current = { itemId, sectionId };
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

    function onPointerUp(): void {
      finishDrop();
      cleanup();
    }

    function onPointerCancel(): void {
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

  return { dragId, dropPosition, dropTargetItemId, dropTargetSectionId, makeHandlers };
}
