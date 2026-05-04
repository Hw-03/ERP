"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { DraftCartItemRow } from "./DraftCartItemRow";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onContinue: (draft: StockRequest) => void;
  onChanged: () => void;
}

export function DraftCartPanel({
  employeeId,
  refreshNonce,
  onContinue,
  onChanged,
}: Props) {
  const [drafts, setDrafts] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockRequest | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setDrafts([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.listStockRequestDrafts(employeeId);
      setDrafts(rows);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "작업 중 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshNonce]);

  const handleDeleteConfirm = async () => {
    if (!employeeId || !deleteTarget) return;
    try {
      setBusyId(deleteTarget.request_id);
      await api.deleteStockRequestDraft(deleteTarget.request_id, employeeId);
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

  const handleSubmit = async (draft: StockRequest) => {
    if (!employeeId) return;
    try {
      setBusyId(draft.request_id);
      await api.submitStockRequestDraft(draft.request_id, employeeId);
      await reload();
      onChanged();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "요청 제출에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  if (!employeeId) {
    return (
      <EmptyState
        compact
        title="담당자를 선택해 주세요."
        description="담당자를 선택하면 작업 중 내역이 표시됩니다."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <LoadingSkeleton variant="list" rows={2} />}
      {loadError && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm"
          style={{
            borderColor: tint(LEGACY_COLORS.red, 30),
            color: LEGACY_COLORS.red,
            background: tint(LEGACY_COLORS.red, 10),
          }}
        >
          {loadError}
        </div>
      )}
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
      {!loading && drafts.length === 0 && !loadError && (
        <EmptyState
          variant="no-data"
          compact
          title="작업 중인 요청이 없습니다."
          description="요청 작성 화면에서 입력하면 자동으로 저장됩니다."
        />
      )}
      {drafts.map((draft) => (
        <DraftCartItemRow
          key={draft.request_id}
          draft={draft}
          isBusy={busyId === draft.request_id}
          onContinue={() => onContinue(draft)}
          onRequestDelete={() => setDeleteTarget(draft)}
          onSubmit={() => void handleSubmit(draft)}
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
        이 작업 항목을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
