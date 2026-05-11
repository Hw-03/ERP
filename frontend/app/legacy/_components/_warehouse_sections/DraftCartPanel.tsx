"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type IoBatch, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { DraftCartItemRow } from "./DraftCartItemRow";

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

function ioDraftTitle(draft: IoBatch) {
  const first = draft.bundles[0]?.title;
  const extra = draft.bundles.length > 1 ? ` 외 ${draft.bundles.length - 1}건` : "";
  return first ? `${first}${extra}` : "입출고 2.0 임시저장";
}

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

  const handleSubmitIo = async (draft: IoBatch) => {
    if (!employeeId) return;
    try {
      setBusyId(draft.batch_id);
      await api.submitDraft(draft.batch_id, employeeId);
      await reload();
      onChanged();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "입출고 작업 제출에 실패했습니다.");
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

      {ioDrafts.map((draft) => {
        const isBusy = busyId === draft.batch_id;
        return (
          <div
            key={draft.batch_id}
            className="rounded-2xl border p-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {ioDraftTitle(draft)}
                </p>
                <p className="mt-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  입출고 2.0 · {draft.work_type}/{draft.sub_type} · 묶음 {draft.bundles.length}개
                </p>
              </div>
              <span
                className="rounded-full px-2 py-1 text-[11px] font-black"
                style={{
                  background: tint(LEGACY_COLORS.blue, 14),
                  color: LEGACY_COLORS.blue,
                }}
              >
                새 작업
              </span>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onContinueIo?.(draft)}
                className="rounded-[10px] border px-3 py-1.5 text-xs font-black disabled:opacity-50"
                style={{
                  background: LEGACY_COLORS.s1,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              >
                이어 작성
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleSubmitIo(draft)}
                className="rounded-[10px] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                style={{ background: LEGACY_COLORS.blue }}
              >
                제출
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setDeleteTarget({ kind: "io", draft })}
                className="rounded-[10px] px-3 py-1.5 text-xs font-black disabled:opacity-50"
                style={{
                  background: tint(LEGACY_COLORS.red, 10),
                  color: LEGACY_COLORS.red,
                }}
              >
                삭제
              </button>
            </div>
          </div>
        );
      })}

      {drafts.map((draft) => (
        <DraftCartItemRow
          key={draft.request_id}
          draft={draft}
          isBusy={busyId === draft.request_id}
          onContinue={() => onContinue(draft)}
          onRequestDelete={() => setDeleteTarget({ kind: "stock", draft })}
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
        이 작업을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
