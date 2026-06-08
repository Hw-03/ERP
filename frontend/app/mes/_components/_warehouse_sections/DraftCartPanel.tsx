"use client";

import { useEffect, useState } from "react";
import type { IoBatch, StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { DraftCartItemRow } from "./DraftCartItemRow";
import { IoDraftWorkCard } from "./IoDraftWorkCard";
import {
  useDeleteIoDraftMutation,
  useDeleteStockRequestDraftMutation,
  useDraftCartQuery,
} from "@/lib/queries/useDraftCartQuery";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onContinue: (draft: StockRequest) => void;
  onContinueIo?: (draft: IoBatch) => void;
  onChanged: () => void;
  onCountChange?: (n: number) => void;
}

type DeleteTarget =
  | { kind: "stock"; draft: StockRequest }
  | { kind: "io"; draft: IoBatch }
  | null;

export function DraftCartPanel({
  employeeId,
  refreshNonce,
  onContinue,
  onContinueIo,
  onChanged,
  onCountChange,
}: Props) {
  const { data, isLoading: loading, error: qError, refetch } = useDraftCartQuery(employeeId);
  const drafts = data?.stockDrafts ?? [];
  const ioDrafts = data?.ioDrafts ?? [];
  const loadError = qError
    ? qError instanceof Error
      ? qError.message
      : "작업 중 목록을 불러오지 못했습니다."
    : null;
  const deleteStockMutation = useDeleteStockRequestDraftMutation();
  const deleteIoMutation = useDeleteIoDraftMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [opError, setOpError] = useState<string | null>(null);

  // refreshNonce 변경 시 수동 refetch (외부 트리거)
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  // 부모 탭 badge 카운트 동기화 (draft 수 변할 때)
  useEffect(() => {
    onCountChange?.(drafts.length + ioDrafts.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts.length, ioDrafts.length]);

  const handleDeleteConfirm = () => {
    if (!employeeId || !deleteTarget) return;
    const targetId =
      deleteTarget.kind === "stock"
        ? deleteTarget.draft.request_id
        : deleteTarget.draft.batch_id;
    setBusyId(targetId);
    const handlers = {
      onSuccess: () => {
        setDeleteTarget(null);
        onChanged();
      },
      onError: (err: unknown) => {
        setOpError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
        setDeleteTarget(null);
      },
      onSettled: () => setBusyId(null),
    };
    if (deleteTarget.kind === "stock") {
      deleteStockMutation.mutate(
        { requestId: deleteTarget.draft.request_id, employeeId },
        handlers,
      );
    } else {
      deleteIoMutation.mutate({ batchId: deleteTarget.draft.batch_id, employeeId }, handlers);
    }
  };

  if (!employeeId) {
    return (
      <EmptyState
        compact
        title="작업자를 선택하세요"
        description="작업자를 선택하면 작업 중 내역이 표시됩니다."
      />
    );
  }

  const empty = !loading && drafts.length === 0 && ioDrafts.length === 0 && !loadError;

  return (
    <div className="flex flex-col gap-3">
      {loading && <LoadingSkeleton variant="list" rows={2} />}
      {loadError && <LoadFailureCard message={loadError} onRetry={() => void refetch()} />}
      {opError && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: tint(LEGACY_COLORS.red, 30),
            color: LEGACY_COLORS.red,
            background: tint(LEGACY_COLORS.red, 10),
          }}
        >
          {opError}
          <button className="ml-2 text-xs underline" onClick={() => setOpError(null)}>
            닫기
          </button>
        </div>
      )}
      {empty && (
        <EmptyState
          variant="no-data"
          compact
          title="작업 중인 요청이 없습니다."
          description="요청 작성 화면에서 입력하면 임시저장할 수 있습니다."
        />
      )}

      {ioDrafts.map((draft) => (
        <IoDraftWorkCard
          key={draft.batch_id}
          draft={draft}
          isBusy={busyId === draft.batch_id}
          onContinue={() => onContinueIo?.(draft)}
          onRequestDelete={() => setDeleteTarget({ kind: "io", draft })}
        />
      ))}

      {drafts.map((draft) => (
        <DraftCartItemRow
          key={draft.request_id}
          draft={draft}
          isBusy={busyId === draft.request_id}
          onContinue={() => onContinue(draft)}
          onRequestDelete={() => setDeleteTarget({ kind: "stock", draft })}
        />
      ))}

      <ConfirmModal
        open={deleteTarget !== null}
        title="작업 삭제"
        tone="danger"
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      >
        이 작업을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
