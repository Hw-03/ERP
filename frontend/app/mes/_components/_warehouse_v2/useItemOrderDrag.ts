"use client";

/**
 * 품목 순서 재정렬 드래그 훅 — Pointer Events 기반.
 *
 * AdminMasterItemsSection 의 pointer-drag 로직(5px 임계값·pointer capture·
 * elementFromPoint·data-item-id 선택자)을 재사용 가능한 훅으로 추출.
 * admin 원본 파일은 수정하지 않는다.
 *
 * 사용법:
 *   const { dragId, dropTargetId, makeHandlers } = useItemOrderDrag(items, onReorder);
 *   // 각 행에서:
 *   <GripVertical {...makeHandlers(item.item_id)} />
 */

import { useRef, useState } from "react";

export interface UseItemOrderDragResult {
  dragId: string | null;
  dropTargetId: string | null;
  /**
   * item_id 를 받아 해당 행의 GripVertical(또는 핸들 엘리먼트)에 스프레드할
   * 포인터 이벤트 핸들러 객체를 반환.
   */
  makeHandlers: (id: string) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

/**
 * @param items - 현재 표시 순서의 품목 배열. item_id 프로퍼티를 가진 임의의 객체.
 * @param onReorder - 드래그 완료 시 새 순서로 재배열된 items 배열을 콜백.
 */
export function useItemOrderDrag<T extends { item_id: string }>(
  items: T[],
  onReorder: (reorderedItems: T[]) => void,
): UseItemOrderDragResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const pointerStartYRef = useRef(0);

  function findItemIdAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    return el?.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null;
  }

  function makeHandlers(id: string) {
    function onPointerDown(e: React.PointerEvent) {
      e.preventDefault();
      e.stopPropagation();
      dragIdRef.current = id;
      pointerStartYRef.current = e.clientY;
      isDraggingRef.current = false;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: React.PointerEvent) {
      if (dragIdRef.current !== id) return;
      if (!isDraggingRef.current && Math.abs(e.clientY - pointerStartYRef.current) > 5) {
        isDraggingRef.current = true;
        setDragId(id);
      }
      if (!isDraggingRef.current) return;
      const target = findItemIdAtPoint(e.clientX, e.clientY);
      const next = target && target !== id ? target : null;
      if (next !== dropTargetIdRef.current) {
        dropTargetIdRef.current = next;
        setDropTargetId(next);
      }
    }

    function onPointerUp(_e: React.PointerEvent) {
      if (isDraggingRef.current && dragIdRef.current && dropTargetIdRef.current) {
        const fromIdx = items.findIndex((it) => it.item_id === dragIdRef.current);
        const toIdx = items.findIndex((it) => it.item_id === dropTargetIdRef.current);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          const next = [...items];
          const [moved] = next.splice(fromIdx, 1);
          if (moved) next.splice(toIdx, 0, moved);
          onReorder(next);
        }
      }
      dragIdRef.current = null;
      dropTargetIdRef.current = null;
      isDraggingRef.current = false;
      setDragId(null);
      setDropTargetId(null);
    }

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      style: { touchAction: "none" } as React.CSSProperties,
    };
  }

  return { dragId, dropTargetId, makeHandlers };
}
