"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { AssemblyChecklistSection } from "@/lib/api/types/assembly-checklists";

type DropPosition = "before" | "after" | null;

type DragHandlers = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  style: CSSProperties;
};

export type UseAssemblyChecklistSectionDragResult = {
  dragId: string | null;
  dropPosition: DropPosition;
  dropTargetSectionId: string | null;
  makeHandlers: (sectionId: string) => DragHandlers;
};

/** 정렬 모드에서 박스 순서를 한 번의 드롭으로 저장할 수 있게 한다. */
export function useAssemblyChecklistSectionDrag(
  sections: AssemblyChecklistSection[],
  onReorder: (sectionIds: string[]) => void,
): UseAssemblyChecklistSectionDragResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const sourceIdRef = useRef<string | null>(null);
  const targetRef = useRef<{ position: DropPosition; sectionId: string | null }>({ position: null, sectionId: null });
  const pointerStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  function cleanup(): void {
    sourceIdRef.current = null;
    targetRef.current = { position: null, sectionId: null };
    isDraggingRef.current = false;
    setDragId(null);
    setDropTargetSectionId(null);
    setDropPosition(null);
  }

  function updateTargetAtPoint(clientX: number, clientY: number): void {
    const element = document.elementFromPoint(clientX, clientY);
    const sectionElement = element?.closest<HTMLElement>("[data-checklist-section-sort-id]") ?? null;
    const sectionId = sectionElement?.dataset.checklistSectionSortId ?? null;
    const rect = sectionElement?.getBoundingClientRect();
    const position: DropPosition = sectionId && rect
      ? clientY < rect.top + rect.height / 2 ? "before" : "after"
      : null;
    if (targetRef.current.sectionId === sectionId && targetRef.current.position === position) return;

    targetRef.current = { position, sectionId };
    setDropTargetSectionId(sectionId);
    setDropPosition(position);
  }

  function finishDrop(): void {
    const sourceId = sourceIdRef.current;
    const target = targetRef.current;
    if (!sourceId || !target.sectionId || !isDraggingRef.current || sourceId === target.sectionId) return;

    const sectionIds = sections.map((section) => section.section_id);
    const sourceIndex = sectionIds.indexOf(sourceId);
    if (sourceIndex < 0) return;
    const [movedSectionId] = sectionIds.splice(sourceIndex, 1);
    if (!movedSectionId) return;
    const targetIndex = sectionIds.indexOf(target.sectionId);
    if (targetIndex < 0) return;
    const insertionIndex = target.position === "after" ? targetIndex + 1 : targetIndex;
    sectionIds.splice(insertionIndex, 0, movedSectionId);
    if (sectionIds.every((sectionId, index) => sectionId === sections[index]?.section_id)) return;
    onReorder(sectionIds);
  }

  function makeHandlers(sectionId: string): DragHandlers {
    function onPointerDown(event: PointerEvent): void {
      event.preventDefault();
      event.stopPropagation();
      sourceIdRef.current = sectionId;
      pointerStartYRef.current = event.clientY;
      isDraggingRef.current = false;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent): void {
      if (sourceIdRef.current !== sectionId) return;
      if (!isDraggingRef.current && Math.abs(event.clientY - pointerStartYRef.current) > 5) {
        isDraggingRef.current = true;
        setDragId(sectionId);
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

  return { dragId, dropPosition, dropTargetSectionId, makeHandlers };
}
