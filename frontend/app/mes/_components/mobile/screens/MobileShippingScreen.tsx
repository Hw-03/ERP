"use client";
import { ReadEmpty, ReadFailure, ReadLoading } from "../../common/ReadState";
import { SkeletonBlock, dataRevealClassName } from "../../common/LoadingSkeleton";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ClipboardList, History, PackageCheck, RotateCcw, Truck, XCircle } from "lucide-react";
import { api, type ShippingRequest, type ShippingRequestRevisionChange, type ShippingRequestStatus } from "@/lib/api";
import { formatBomQuantity } from "@/lib/mes/bomFormat";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { queryKeys } from "@/lib/queries/keys";
import { useShippingHistoryQuery, useShippingRequestsQuery } from "@/lib/queries/useShippingQuery";
import { ExpandableItemName } from "../../_warehouse_v2/ExpandableItemName";

type MobileShippingTab = "requests" | "prep" | "history";

const RESUME_REFETCH_DEDUP_MS = 250;

const STATUS_LABEL: Record<ShippingRequestStatus, string> = {
  PREPARING: "준비 중",
  PREPARED: "준비 완료",
  PICKED_UP: "픽업 완료",
  CANCELLED: "요청 취소",
};

const STATUS_TONE: Record<ShippingRequestStatus, string> = {
  PREPARING: LEGACY_COLORS.green,
  PREPARED: LEGACY_COLORS.yellow,
  PICKED_UP: LEGACY_COLORS.purple,
  CANCELLED: LEGACY_COLORS.red,
};

export function MobileShippingScreen() {
  const [tab, setTab] = useState<MobileShippingTab>("prep");
  const [mutationErrors, setMutationErrors] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const requestsQuery = useShippingRequestsQuery(undefined, { live: true });
  const historyQuery = useShippingHistoryQuery(tab === "history");
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const history = historyQuery.data ?? [];
  const refetchRequests = requestsQuery.refetch;
  const lastResumeRefetchAtRef = useRef<number | null>(null);

  const activeRequests = useMemo(
    () => requests.filter((req) => req.status !== "PICKED_UP" && req.status !== "CANCELLED"),
    [requests],
  );
  const prepRequests = useMemo(
    () => requests.filter((req) => req.status === "PREPARING" || req.status === "PREPARED"),
    [requests],
  );

  const refetchAfterResume = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    const lastRefetchAt = lastResumeRefetchAtRef.current;
    if (lastRefetchAt !== null && now - lastRefetchAt < RESUME_REFETCH_DEDUP_MS) return;
    lastResumeRefetchAtRef.current = now;
    void refetchRequests({ cancelRefetch: false });
  }, [refetchRequests]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refetchAfterResume();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refetchAfterResume);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refetchAfterResume);
    };
  }, [refetchAfterResume]);

  function upsert(next: ShippingRequest) {
    queryClient.setQueryData<ShippingRequest[]>(queryKeys.shipping.requests(), (prev = []) => [
      next,
      ...prev.filter((row) => row.request_id !== next.request_id),
    ]);
  }

  async function updateChecklist(req: ShippingRequest, itemId: string, checked: boolean) {
    if (req.status !== "PREPARING") return;
    setPendingId(`${req.request_id}-${itemId}`);
    setMutationErrors((current) => {
      const { [req.request_id]: _cleared, ...remaining } = current;
      return remaining;
    });
    try {
      upsert(await api.updateShippingChecklist(req.request_id, { checks: [{ item_id: itemId, checked }] }));
    } catch (err) {
      setMutationErrors((current) => ({
        ...current,
        [req.request_id]: err instanceof Error ? err.message : "체크리스트 수정에 실패했습니다.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  async function clearChecklist(req: ShippingRequest) {
    if (req.status !== "PREPARING") return;
    setPendingId(`${req.request_id}-clear`);
    setMutationErrors((current) => {
      const { [req.request_id]: _cleared, ...remaining } = current;
      return remaining;
    });
    try {
      upsert(await api.clearShippingChecklist(req.request_id));
    } catch (err) {
      setMutationErrors((current) => ({
        ...current,
        [req.request_id]: err instanceof Error ? err.message : "체크리스트 전체 해제에 실패했습니다.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  const activeQuery = tab === "history" ? historyQuery : requestsQuery;
  const loading = activeQuery.isLoading || (activeQuery.isFetching && activeQuery.isPlaceholderData);
  const queryError = tab === "history" ? historyQuery.error : requestsQuery.error;
  const error = queryError instanceof Error ? queryError.message : queryError ? "출하 데이터를 불러오지 못했습니다." : null;
  const hasActiveData = activeQuery.data !== undefined && !activeQuery.isPlaceholderData;
  const initialError = hasActiveData ? null : error;
  const refreshError = hasActiveData ? error : null;
  const retryRefresh = () => {
    void activeQuery.refetch();
  };

  return (
    <div className="mw0 scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
      <div className="px-1 py-1">
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}>
            <Truck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-tight" style={{ color: LEGACY_COLORS.text }}>출하</span>
            <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              생성·수정·완료 처리는 PC에서 진행합니다.
            </span>
          </span>
        </div>
      </div>

      <div className="mw0 grid grid-cols-3 gap-2">
        <TabButton active={tab === "requests"} icon={ClipboardList} label="요청" onClick={() => setTab("requests")} />
        <TabButton active={tab === "prep"} icon={PackageCheck} label="준비" onClick={() => setTab("prep")} />
        <TabButton active={tab === "history"} icon={History} label="이력" onClick={() => setTab("history")} />
      </div>

      {loading && <ReadLoading label="출하 데이터를 불러오고 있습니다." skeleton={<ShippingSkeleton tab={tab} />} />}
      {initialError && <ReadFailure message={initialError} onRetry={retryRefresh} />}
      {refreshError && (
        <ReadFailure
          message={refreshError}
          refresh
          onRetry={retryRefresh}
        />
      )}

      {!loading && !initialError && tab === "requests" && (
        <div className={`mw0 grid gap-2 ${dataRevealClassName}`}>
          {activeRequests.length === 0 ? (
            <ReadEmpty title="출하 요청이 없습니다" description="PC에서 새 출하 요청을 만들 수 있습니다." />
          ) : (
            activeRequests.map((req) => <MobileRequestCard key={req.request_id} request={req} />)
          )}
        </div>
      )}

      {!loading && !initialError && tab === "prep" && (
        <div className={`mw0 grid gap-2 ${dataRevealClassName}`}>
          {prepRequests.length === 0 ? (
            <ReadEmpty title="준비 중인 출하가 없습니다" description="PC에서 새 출하 요청을 만들면 바로 표시됩니다." />
          ) : (
            prepRequests.map((req) => (
              <MobilePrepCard
                key={req.request_id}
                request={req}
                pendingId={pendingId}
                error={mutationErrors[req.request_id] ?? null}
                onCheck={updateChecklist}
                onClear={clearChecklist}
              />
            ))
          )}
        </div>
      )}

      {!loading && !initialError && tab === "history" && (
        <div className={`mw0 grid gap-2 ${dataRevealClassName}`}>
          {history.length === 0 ? (
            <ReadEmpty title="출하 이력이 없습니다" description="픽업 완료된 출하가 아직 없습니다." />
          ) : (
            history.map((req) => <MobileRequestCard key={req.request_id} request={req} />)
          )}
        </div>
      )}
    </div>
  );
}

/** 준비는 접힌 구성품 행, 요청·이력은 최종 PA/PF 정보 영역을 예약한다. */
function ShippingSkeleton({ tab }: { tab: MobileShippingTab }): React.ReactNode {
  return <div data-testid={`mobile-shipping-${tab}-skeleton`} className="mw0 grid gap-2">
    {[0, 1].map((row) => <div key={row} className="mw0 oh rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 flex-1 flex-col gap-2"><SkeletonBlock className="h-11 w-4/5" /><SkeletonBlock className="h-3 w-2/3" /></div><SkeletonBlock className="h-6 w-16 rounded-full" /></div>
      {tab === "prep" ? <>
        <div className="mt-3"><SkeletonBlock className="h-5 w-28" /></div>
        <div className="mt-3 grid gap-1">{[0, 1].map((group) => <div key={group} className="flex min-h-11 items-center justify-between gap-2 border-t px-1 py-2" style={{ borderColor: LEGACY_COLORS.border }}><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="h-3 w-16" /><ChevronDown className="h-5 w-5 shrink-0" /></div>)}</div>
        <div className="mt-3 flex min-h-11 items-center justify-center rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}><SkeletonBlock className="h-4 w-20" /></div>
      </> : <div className="mt-3 grid grid-cols-2 gap-2">{["최종 PA", "최종 PF"].map((label) => <div key={label} className="mw0 border-t pt-2" style={{ borderColor: LEGACY_COLORS.border }}><div className="mb-1 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div><SkeletonBlock className="h-11 w-full" /></div>)}</div>}
    </div>)}
  </div>;
}

const REVISION_FIELD_LABEL: Record<string, string> = {
  request_quantity: "출하 수량",
  custom_pa_name: "PA 품목명",
  custom_pf_name: "PF 품목명",
  notes: "메모",
  bom_lines: "BOM 구성",
  companion_lines: "동반 출하품",
};

type RevisionSnapshotLine = {
  parentStage: string | null;
  itemId: string | null;
  itemName: string | null;
  mesCode: string | null;
  quantity: number | null;
  unit: string;
  included?: boolean;
};

function formatKst(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((row) => row.type === type)?.value ?? "--";
  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")} KST`;
}

function snapshotLines(value: unknown): RevisionSnapshotLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const rawItemId = row.child_item_id ?? row.item_id;
    return [{
      parentStage: typeof row.parent_stage === "string" ? row.parent_stage : null,
      itemId: typeof rawItemId === "string" ? rawItemId : null,
      itemName: typeof row.item_name === "string" ? row.item_name : null,
      mesCode: typeof row.mes_code === "string" ? row.mes_code : null,
      quantity: typeof row.quantity === "number" ? row.quantity : null,
      unit: typeof row.unit === "string" && row.unit ? row.unit : "EA",
      included: typeof row.included === "boolean" ? row.included : undefined,
    }];
  });
}

function snapshotKey(line: RevisionSnapshotLine, index: number): string {
  return `${line.parentStage ?? "ITEM"}:${line.itemId ?? index}`;
}

function snapshotName(line: RevisionSnapshotLine): string {
  const stage = line.parentStage ? `[${line.parentStage}] ` : "";
  const name = line.itemName ?? line.mesCode ?? "이름 없음";
  const code = line.mesCode && line.mesCode !== name ? ` (${line.mesCode})` : "";
  return `${stage}${name}${code}`;
}

function snapshotDescription(line: RevisionSnapshotLine, compactQuantity = false): string {
  const quantity = compactQuantity && line.quantity !== null
    ? formatBomQuantity(line.quantity, line.unit)
    : `${line.quantity ?? "-"} ${line.unit}`;
  return `${snapshotName(line)} · ${quantity}`;
}

function arrayChangeDetails(change: ShippingRequestRevisionChange, compactQuantity = false): string[] {
  const before = snapshotLines(change.before);
  const after = snapshotLines(change.after);
  const beforeByKey = new Map(before.map((line, index) => [snapshotKey(line, index), line]));
  const afterByKey = new Map(after.map((line, index) => [snapshotKey(line, index), line]));
  const keys = Array.from(beforeByKey.keys());
  afterByKey.forEach((_line, key) => {
    if (!beforeByKey.has(key)) keys.push(key);
  });
  const details: string[] = [];

  for (const key of keys) {
    const previous = beforeByKey.get(key);
    const next = afterByKey.get(key);
    if (!previous && next) {
      details.push(`추가: ${snapshotDescription(next, compactQuantity)}`);
    } else if (previous && !next) {
      details.push(`삭제: ${snapshotDescription(previous, compactQuantity)}`);
    } else if (previous && next) {
      if (previous.quantity !== next.quantity) {
        const previousQuantity = compactQuantity && previous.quantity !== null
          ? formatBomQuantity(previous.quantity, previous.unit)
          : `${previous.quantity ?? "-"}`;
        const nextQuantity = compactQuantity && next.quantity !== null
          ? formatBomQuantity(next.quantity, next.unit)
          : `${next.quantity ?? "-"} ${next.unit}`;
        details.push(`수량 변경: ${snapshotName(next)} · ${previousQuantity} → ${nextQuantity}`);
      }
      if (previous.included !== next.included && (previous.included !== undefined || next.included !== undefined)) {
        const before = previous.included === undefined ? "미지정" : previous.included ? "포함" : "제외";
        const after = next.included === undefined ? "미지정" : next.included ? "포함" : "제외";
        details.push(`포함 상태 변경: ${snapshotName(next)} · ${before} → ${after}`);
      }
      const metadataChanged = previous.parentStage !== next.parentStage
        || previous.itemName !== next.itemName
        || previous.mesCode !== next.mesCode
        || previous.unit !== next.unit;
      if (metadataChanged) {
        details.push(`변경: ${snapshotDescription(previous, compactQuantity)} → ${snapshotDescription(next, compactQuantity)}`);
      }
    }
  }
  return details.length > 0 ? details : ["구성 순서가 변경되었습니다."];
}

function scalarChangeDetails(change: ShippingRequestRevisionChange): string[] {
  const display = (value: unknown) => value === null || value === undefined || value === "" ? "없음" : String(value);
  if (change.field === "request_quantity") {
    return [`${display(change.before)}대 → ${display(change.after)}대`];
  }
  return [`${display(change.before)} → ${display(change.after)}`];
}

function revisionSummary(changes: ShippingRequestRevisionChange[]): string {
  const labels = changes
    .flatMap((change) => REVISION_FIELD_LABEL[change.field] ? [REVISION_FIELD_LABEL[change.field]] : [])
    .filter((label, index, all) => all.indexOf(label) === index);
  return labels.length > 0 ? `${labels.join(" · ")} 수정` : "준비 정보가 수정되었습니다.";
}

function PreparationRevisionNotice({ request }: { request: ShippingRequest }) {
  const [open, setOpen] = useState(false);
  const revision = request.latest_preparation_revision;
  if (request.status !== "PREPARING" || !revision?.affects_preparation) return null;
  const summary = revisionSummary(revision.changes);

  return (
    <section
      className="mt-3 rounded-[14px] border px-3 py-2"
      style={{ background: tint(LEGACY_COLORS.yellow, 10), borderColor: tint(LEGACY_COLORS.yellow, 42) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-1 text-xs font-black"
          style={{ background: tint(LEGACY_COLORS.yellow, 24), color: LEGACY_COLORS.yellow }}
        >
          수정됨
        </span>
        <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
          {revision.edited_by_name} · {formatKst(revision.created_at)}
        </span>
      </div>
      <div className="mt-2 truncate text-xs font-bold" title={summary} style={{ color: LEGACY_COLORS.text }}>
        {summary}
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] px-2 text-left text-xs font-black"
        style={{ color: LEGACY_COLORS.yellow }}
      >
        {open ? "변경 내용 접기" : "변경 내용 보기"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-2 border-t pt-2" style={{ borderColor: tint(LEGACY_COLORS.yellow, 35) }}>
          {revision.changes.map((change) => {
            const details = change.field === "bom_lines" || change.field === "companion_lines"
              ? arrayChangeDetails(change, change.field === "bom_lines")
              : scalarChangeDetails(change);
            return (
              <div key={change.field} className="border-t py-2 [overflow-wrap:anywhere]" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-xs font-black" style={{ color: LEGACY_COLORS.text }}>
                  {REVISION_FIELD_LABEL[change.field] ?? change.field}
                </div>
                <ul className="mt-1 grid gap-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MobilePrepCard({
  request,
  pendingId,
  error,
  onCheck,
  onClear,
}: {
  request: ShippingRequest;
  pendingId: string | null;
  error: string | null;
  onCheck: (req: ShippingRequest, itemId: string, checked: boolean) => void;
  onClear: (req: ShippingRequest) => void;
}) {
  const editable = request.status === "PREPARING";
  const checklistGroups = new Map<string, ShippingRequest["checklist_lines"]>();
  for (const line of request.checklist_lines) {
    const code = line.process_type_code ?? "";
    const lines = checklistGroups.get(code) ?? [];
    lines.push(line);
    checklistGroups.set(code, lines);
  }
  return (
    <div className="mw0 oh rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <CardHeader request={request} />
      <PreparationRevisionNotice request={request} />
      {error && <InlineState title="오류" body={error} tone={LEGACY_COLORS.red} compact />}
      <div className="mt-3 text-sm font-bold" style={{ color: LEGACY_COLORS.green }}>
        총 {request.request_quantity ?? 1}대 출하
      </div>
      <div className="mt-3 grid gap-1">
        {request.checklist_lines.length === 0 ? (
          <InlineState title="체크 항목 없음" body="PC에서 BOM을 확인하세요." compact />
        ) : (
          Array.from(checklistGroups, ([code, lines]) => (
            <details key={code} className="group border-t" style={{ borderColor: LEGACY_COLORS.border }}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 py-2 text-sm font-bold focus-visible:rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 break-words">{code ? `${code} 구성품` : "기타 구성품"}</span>
                <span className="shrink-0 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>항목 {lines.length}개</span>
                <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid gap-1 pb-2">
                {lines.map((line) => (
                  <label
                    key={line.line_id}
                    className="mw0 flex min-h-[52px] items-center gap-3 rounded-[12px] px-2 py-3"
                    style={{ background: line.checked ? tint(LEGACY_COLORS.green, 8) : "transparent" }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${line.item_name} 체크`}
                      checked={line.checked}
                      disabled={!editable || pendingId !== null}
                      onChange={(event) => onCheck(request, line.item_id, event.target.checked)}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="ba block break-words text-sm font-bold leading-snug" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</span>
                      <span className="mt-1 block break-all font-mono text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>{line.quantity}개</span>
                    {line.checked ? <CheckCircle2 className="h-5 w-5" style={{ color: LEGACY_COLORS.green }} /> : <XCircle className="h-5 w-5" style={{ color: LEGACY_COLORS.muted2 }} />}
                  </label>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => onClear(request)}
        disabled={!editable || pendingId !== null || request.checklist_lines.length === 0}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-bold disabled:opacity-45"
        style={{ background: tint(LEGACY_COLORS.yellow, 12), borderColor: tint(LEGACY_COLORS.yellow, 45), color: LEGACY_COLORS.yellow }}
      >
        <RotateCcw className="h-4 w-4" />
        전체 해제
      </button>
    </div>
  );
}

function MobileRequestCard({ request }: { request: ShippingRequest }) {
  return (
    <div className="mw0 oh rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <CardHeader request={request} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoPill label="최종 PA" value={request.final_pa_item_name ?? "-"} />
        <InfoPill label="최종 PF" value={request.final_pf_item_name ?? "-"} />
      </div>
    </div>
  );
}

function CardHeader({ request }: { request: ShippingRequest }) {
  return (
    <div className="mw0 flex items-start justify-between gap-3">
      <div className="mw0 flex-1">
        <ExpandableItemName
          name={request.base_pf_item_name}
          className="block min-h-11 text-[15px] font-semibold leading-snug"
          collapsedClassName="line-clamp-2 whitespace-normal"
          style={{ color: LEGACY_COLORS.text }}
        />
        <div className="mt-1 break-words text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{request.base_pf_mes_code ?? "-"} · {request.requested_by_name ?? "요청자 없음"}</div>
      </div>
      <span className="shrink-0 rounded-full px-2 py-1 text-xs font-bold" style={{ background: tint(STATUS_TONE[request.status], 12), color: STATUS_TONE[request.status] }}>
        {STATUS_LABEL[request.status]}
      </span>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="mw0 border-t pt-2" style={{ borderColor: LEGACY_COLORS.border }}>
      <div className="mb-1 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      {value === "-" ? (
        <div className="text-xs font-black" style={{ color: LEGACY_COLORS.text }}>{value}</div>
      ) : (
        <ExpandableItemName
          name={value}
          className="block min-h-11 text-sm font-semibold leading-snug"
          collapsedClassName="line-clamp-2 whitespace-normal"
          style={{ color: LEGACY_COLORS.text }}
        />
      )}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Truck; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center gap-2 rounded-[12px] border text-sm font-bold"
      style={{
        background: active ? tint(LEGACY_COLORS.blue, 18) : LEGACY_COLORS.s1,
        borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
        color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
      }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function InlineState({ title, body, tone = LEGACY_COLORS.muted2, compact = false }: { title: string; body: string; tone?: string; compact?: boolean }) {
  return (
    <div className={`rounded-[16px] border text-center ${compact ? "px-3 py-4" : "px-4 py-8"}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="text-sm font-black" style={{ color: tone }}>{title}</div>
      <div className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
    </div>
  );
}
