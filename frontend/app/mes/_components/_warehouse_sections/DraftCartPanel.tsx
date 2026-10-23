"use client";

import { FilePenLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { IoBatch, StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState } from "../common";
import { ReadFailure } from "../common/ReadState";
import { WorkContentCover } from "./WorkContentCover";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { Button } from "@/lib/ui/Button";
import { AllWorkDraftsPanel } from "./AllWorkDraftsPanel";
import { DraftCartItemRow } from "./DraftCartItemRow";
import { IoDraftWorkCard } from "./IoDraftWorkCard";
import { IoDraftWorkTable } from "./IoDraftWorkTable";
import { WarehouseEmptyWorkArea } from "./WarehouseEmptyWorkArea";
import panelStyles from "../mobile/screens/mobileWarehousePanels.module.css";
import {
  useDeleteIoDraftMutation,
  useDeleteStockRequestDraftMutation,
  useDraftCartQuery,
} from "@/lib/queries/useDraftCartQuery";

interface Props {
  layout: "desktop" | "mobile";
  employeeId: string | null;
  defaultScope?: "mine" | "all";
  refreshNonce: number;
  onContinue: (draft: StockRequest) => void;
  onContinueIo?: (draft: IoBatch) => void;
  onChanged: () => void;
  onCountChange?: (n: number) => void;
  onEmptyStateChange?: (empty: boolean) => void;
  onStartCompose?: () => void;
}

type DeleteTarget =
  | { kind: "stock"; draft: StockRequest }
  | { kind: "io"; draft: IoBatch }
  | null;

export function DraftCartPanel(props: Props) {
  return <DraftCartPanelContent key={`${props.employeeId ?? "no-employee"}:${props.defaultScope ?? "mine"}`} {...props} />;
}

/** 직원·부서 승인 권한이 바뀌면 역할에 맞는 기본 조회 범위로 초기화한다. */
function DraftCartPanelContent({
  layout,
  employeeId,
  defaultScope = "mine",
  refreshNonce,
  onContinue,
  onContinueIo,
  onChanged,
  onCountChange,
  onEmptyStateChange,
  onStartCompose,
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
  const [scope, setScope] = useState<"mine" | "all">(defaultScope);
  const empty = Boolean(employeeId) && !loading && drafts.length === 0 && ioDrafts.length === 0 && (data !== undefined || !loadError);

  useEffect(() => {
    onEmptyStateChange?.(scope === "mine" && (loading || (empty && !opError)));
  }, [empty, loading, onEmptyStateChange, opError, scope]);

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
    if (!employeeId || !deleteTarget || busyId) return;
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
      const expectedRevision = deleteTarget.draft.revision;
      if (!Number.isInteger(expectedRevision)) {
        setBusyId(null);
        setOpError("작업 버전을 확인할 수 없습니다. 목록을 새로 불러온 뒤 다시 시도하세요.");
        void refetch();
        return;
      }
      deleteIoMutation.mutate({ batchId: deleteTarget.draft.batch_id, employeeId, expectedRevision: expectedRevision! }, handlers);
    }
  };

  return (
    <div className={`flex ${layout === "mobile" ? "min-h-full [&_.dexray-empty-state]:min-h-0" : "min-h-0"} flex-1 flex-col gap-3`}>
      <div className={`shrink-0 border p-3 ${scope === "all" && employeeId ? "rounded-t-[24px] border-b-0" : "rounded-[24px]"}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div role="group" aria-label="작업 조회 범위" className="grid grid-cols-2 gap-1 rounded-[16px] p-1" style={{ background: LEGACY_COLORS.bg }}>
          {(["mine", "all"] as const).map((value) => <Button key={value} variant="ghost" className="min-h-11 min-w-0 w-full !text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]" style={{ background: scope === value ? LEGACY_COLORS.s1 : "transparent", borderColor: scope === value ? LEGACY_COLORS.border : "transparent", color: scope === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2, filter: "none", boxShadow: scope === value ? `0 2px 6px color-mix(in srgb, ${LEGACY_COLORS.text} 8%, transparent)` : "none" }} aria-pressed={scope === value} disabled={!employeeId} onClick={() => { setScope(value); setDeleteTarget(null); setOpError(null); }}>{value === "mine" ? "내 작업" : "전체 작업"}</Button>)}
        </div>
      </div>
      <div key={scope} data-work-scope={scope} className="relative flex min-h-0 flex-1 flex-col gap-3">
      {!employeeId ? <EmptyState compact title="작업자를 선택하세요" description="작업자를 선택하면 작업 중 내역이 표시됩니다." /> : scope === "all" ? <AllWorkDraftsPanel employeeId={employeeId} layout={layout} refreshNonce={refreshNonce} /> : <>
      {loading && <span role="status" className="sr-only">요청 내역을 불러오고 있습니다…</span>}
      {loadError && <ReadFailure message={loadError} refresh={data !== undefined} onRetry={() => void refetch()} />}
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
        <WarehouseEmptyWorkArea
          icon={<FilePenLine style={{ color: LEGACY_COLORS.green }} />}
          title="작업 중인 요청이 없습니다."
          description="요청 작성 화면에서 입력하면 임시저장할 수 있습니다."
          action={onStartCompose ? { label: "요청 작성", onClick: onStartCompose } : undefined}
        />
      )}

      {layout === "desktop" && ioDrafts.length > 0 ? (
        <IoDraftWorkTable
          drafts={ioDrafts}
          busyId={busyId}
          onContinue={(draft) => onContinueIo?.(draft)}
          onRequestDelete={(draft) => setDeleteTarget({ kind: "io", draft })}
        />
      ) : (
        ioDrafts.map((draft) => (
          <IoDraftWorkCard
            key={draft.batch_id}
            draft={draft}
            isBusy={busyId === draft.batch_id}
            onContinue={() => onContinueIo?.(draft)}
            onRequestDelete={() => setDeleteTarget({ kind: "io", draft })}
          />
        ))
      )}

      {drafts.map((draft) => (
        <DraftCartItemRow
          key={draft.request_id}
          draft={draft}
          isBusy={busyId === draft.request_id}
          onContinue={() => onContinue(draft)}
          onRequestDelete={() => setDeleteTarget({ kind: "stock", draft })}
        />
      ))}
      <WorkContentCover pending={loading} failed={Boolean(loadError || opError)} />
      </>}
      </div>

      <ConfirmModal
        className={layout === "mobile" ? panelStyles.touchScope : undefined}
        open={deleteTarget !== null}
        title="작업 삭제"
        tone="danger"
        confirmLabel="삭제"
        busy={busyId !== null}
        busyLabel="삭제 중..."
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      >
        이 작업을 삭제하시겠습니까?
      </ConfirmModal>
    </div>
  );
}
