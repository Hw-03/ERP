"use client";

import { type ReactElement, useState } from "react";
import { useInventoryOperationsQuery } from "@/lib/queries/useInventoryOperationsQuery";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { InventoryOperationDetail, operationSummary } from "./InventoryOperationDetail";
import { formatHistoryDate } from "./historyFormat";
import { inventoryOperationLabel } from "./inventoryOperationPresentation";

/** 기존 거래 목록과 독립적으로 수량 없는 관측·업무 정정까지 조회한다. */
export function InventoryOperationHistory(): ReactElement {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useInventoryOperationsQuery({ limit: 50, cursor: cursors[cursors.length - 1] });
  if (selectedId) return <InventoryOperationDetail operationId={selectedId} onBack={() => setSelectedId(null)} onNavigate={setSelectedId} />;
  const nextCursor = query.data?.nextCursor;
  return (
    <section aria-label="통합 작업 이력" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm" style={{ color: C.text }}>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">통합 작업 이력</h2>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>수량 변동, 실사 관측, 업무 정정을 함께 확인합니다.</p>
        </div>
        <Button variant="secondary" size="md" className="min-h-11" onClick={() => void query.refetch()}>새로고침</Button>
      </header>
      {query.isLoading ? <LoadingSkeleton rows={5} /> : query.isError ? (
        <LoadFailureCard
          prefix="작업 이력을 불러오지 못했습니다"
          message={query.error instanceof Error ? query.error.message : "다시 시도해 주세요."}
          retryLabel="다시 시도"
          onRetry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <ul className="space-y-2">
          {query.data.items.map((operation) => (
            <li key={operation.operationId}>
              <button
                type="button"
                aria-label={`${inventoryOperationLabel(operation)} 상세`}
                onClick={() => setSelectedId(operation.operationId)}
                className="min-h-11 w-full rounded-[20px] border p-4 text-left focus-visible:outline focus-visible:outline-2"
                style={{ background: C.s1, borderColor: C.border }}
              >
                <span className="flex flex-wrap justify-between gap-2">
                  <strong>{inventoryOperationLabel(operation)}</strong>
                  <time className="text-xs" style={{ color: C.muted }} dateTime={operation.effectiveAt}>{formatHistoryDate(operation.effectiveAt)}</time>
                </span>
                <span className="mt-2 block">{operationSummary(operation)}</span>
                <span className="mt-1 block text-xs" style={{ color: C.muted }}>
                  {[operation.department, operation.actorName].filter(Boolean).join(" · ")}
                  {operation.effectiveStatus === "cancelled" ? " · 취소된 작업" : operation.effectiveStatus === "cancellation" ? " · 취소 기록" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="작업 이력이 없습니다." description="" />}
      <div className="mt-auto flex justify-between gap-2 pt-2">
        <Button variant="secondary" size="md" className="min-h-11" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors((value) => value.slice(0, -1))}>이전</Button>
        <Button variant="secondary" size="md" className="min-h-11" disabled={!nextCursor || query.isFetching} onClick={() => { if (nextCursor) setCursors((value) => [...value, nextCursor]); }}>다음</Button>
      </div>
    </section>
  );
}
