"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type IoBatch, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { DraftCartItemRow } from "./DraftCartItemRow";
import { IoDraftWorkCard } from "./IoDraftWorkCard";

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
  const [drafts, setDrafts] = useState<StockRequest[]>([]);
  const [ioDrafts, setIoDrafts] = useState<IoBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setDrafts([]);
      setIoDrafts([]);
      onCountChange?.(0);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [legacyRows, ioRows] = await Promise.all([
        api.listStockRequestDrafts(employeeId),
        api.listDrafts(employeeId),
      ]);
      setDrafts(legacyRows);
      setIoDrafts(ioRows);
      onCountChange?.(legacyRows.length + ioRows.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "작업 중 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [employeeId, onCountChange]);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const handleDeleteConfirm = async () => {
    if (!employeeId || !deleteTarget) return;
    try {
      setBusyId(deleteTarget.kind === "stock" ? deleteTarget.draft.request_id : deleteTarget.draft.batch_id);
      if (deleteTarget.kind === "stock") {
        await api.deleteStockRequestDraft(deleteTarget.draft.request_id, employeeId);
      } else {
        await api.deleteDraft(deleteTarget.draft.batch_id, employeeId);
      }
      setDeleteTarget(null);
      await reload();
      onChanged();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
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
      {loadError && <LoadFailureCard message={loadError} onRetry={() => void reload()} />}
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
        onConfirm={() => void handleDeleteConfirm()}
      >
        이 작업을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
