"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { isStocktakeNotApplied, stocktakeApi } from "@/lib/api/stocktake";
import { formatKstDateTime } from "@/lib/mes-format";
import type { StocktakeCount, StocktakeLatestSummaryResponse, StocktakePage, StocktakeProgress, StocktakeRound, StocktakeTarget, StocktakeWaitingSelection } from "@/lib/api/types/stocktake";
import { readOperatorSession, restoreOperatorSession, validateTabOwnership, type StoredOperatorSession } from "@/lib/auth/operator-session";
import { ApiError } from "@/lib/api-core";
import { OPERATOR_LOGIN_CHANGED, OPERATOR_LOGIN_REQUIRED, requestOperatorLogin } from "@/lib/auth/login-recovery";
import { useConfirmNavigation, useRegisterDirty } from "@/lib/ui/dirty-guard";
import type { Operator } from "../login/useCurrentOperator";
import { CATEGORIES, type Quantities } from "./countDraft";
import { CATEGORY_LABELS, STOCKTAKE_BUTTON, STOCKTAKE_CARD, StocktakeCountEditor } from "./StocktakeCountEditor";
import { StocktakeManagement } from "./StocktakeManagement";
import { StocktakeRoundHistory } from "./StocktakeRoundHistory";
import { StocktakeMenuVisibilityCard } from "./StocktakeMenuVisibilityCard";
import { StocktakeCommandRecovery, type RecoveredStocktakeCommand } from "./StocktakeCommandRecovery";
import { StocktakeLayout, type StocktakeVariant } from "./StocktakeLayout";
import { StocktakeSummary } from "./StocktakeSummary";
import { StocktakeTargetList, STOCKTAKE_STATUS_LABEL, stocktakeStatusTone } from "./StocktakeTargetList";
import { InventoryFilters } from "../_inventory_sections/InventoryFilterBar";
import type { InventoryFilterLogic } from "../_inventory_sections/inventoryFilter";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import summaryStyles from "./StocktakeSummary.module.css";
import { InventoryFilterToggleButton } from "../_inventory_sections/InventoryFilterToggleButton";
import { InventorySearchToolbar } from "../_inventory_sections/InventorySearchToolbar";
import { ReadFailure } from "../common/ReadState";
import { StocktakeLoadingSkeleton } from "./StocktakeLoadingSkeleton";
import { KPI_STATUS, stocktakeItemStatus, type StocktakeKpi } from "./stocktakeTargetFilter";
import { useItemImageManifest } from "../_hooks/useItemImageManifest";
import { StocktakeItemPhoto } from "./StocktakeItemPhoto";
import { StocktakeSearchHeader } from "./StocktakeSearchHeader";
import { StocktakeToolbarMenu, type StocktakeSection } from "./StocktakeToolbarMenu";
import { canManageStocktakeRounds } from "./stocktakeAuthority";
import { ownedWaitingLocations } from "./stocktakeSelection";
import { StocktakeIdlePanel } from "./StocktakeIdlePanel";
import { useItemSearch } from "@/lib/queries/useItemSearch";

type Section = StocktakeSection;
const STOCKTAKE_DEPARTMENTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;
type ApplyPreview = {
  preview_id: string; preview_hash: string; can_apply: boolean; expires_at: string;
  entries: Array<{ target_id: string; item_id?: string; item_name?: string; scope_id: string; scope_name?: string; confirmed_name: string; confirmed_at: string; confirmation_revision_id: string;
    before: Quantities; after: Quantities; deltas: Quantities; reservations: Quantities;
    held: Array<{ code: string; category?: string; counted?: number; reserved?: number }> }>;
};

/** Shared desktop/mobile screen; list invalidation never owns the local count draft. */
export function StocktakeView({ operator, variant = "desktop" }: { operator: Operator | null; variant?: StocktakeVariant }) {
  const employeeId = operator?.employee_id;
  const operatorRef = useRef(operator);
  operatorRef.current = operator;
  const [workspaceOperator, setWorkspaceOperator] = useState<Operator | null>(null);
  const [session, setSession] = useState<StoredOperatorSession | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loginRevision, setLoginRevision] = useState(0);
  const [ownershipChecking, setOwnershipChecking] = useState(true);
  useEffect(() => {
    const changed = () => setLoginRevision((revision) => revision + 1);
    const required = () => setAuthenticated(false);
    window.addEventListener(OPERATOR_LOGIN_CHANGED, changed);
    window.addEventListener(OPERATOR_LOGIN_REQUIRED, required);
    return () => {
      window.removeEventListener(OPERATOR_LOGIN_CHANGED, changed);
      window.removeEventListener(OPERATOR_LOGIN_REQUIRED, required);
    };
  }, []);
  useEffect(() => {
    let live = true;
    setAuthenticated(false);
    setOwnershipChecking(true);
    setAuthError("");
    void (async () => {
      try {
        await validateTabOwnership();
        if (!live) return;
        const stored = restoreOperatorSession(employeeId);
        if (stored && employeeId) {
          const current = await readOperatorSession(stored.token);
          if (live && current.employee_id === employeeId) { setSession(stored); setWorkspaceOperator(operatorRef.current); setAuthenticated(true); }
          else if (live) requestOperatorLogin();
        } else if (employeeId) {
          requestOperatorLogin();
        }
      } catch (failure) {
        if (!live) return;
        if (failure instanceof ApiError && failure.code === "OPERATOR_SESSION_INVALID") requestOperatorLogin();
        else setAuthError("로그인 정보를 확인하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.");
      }
      finally { if (live) setOwnershipChecking(false); }
    })();
    return () => { live = false; };
  }, [employeeId, loginRevision]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => requestOperatorLogin(session.token), Math.max(0, Date.parse(session.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
  if (!operator) return <p className="p-6 text-sm">작업자로 로그인해 주세요.</p>;
  return <div className={`flex min-h-0 min-w-0 flex-1 flex-col text-[var(--c-text)] ${variant === "mobile" ? "gap-2" : "gap-3"}`}>
    {ownershipChecking && !session && <StocktakeLoadingSkeleton variant={variant} />}
    {authError && <ReadFailure message={authError} onRetry={() => setLoginRevision((revision) => revision + 1)} />}
    {session && workspaceOperator && <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${!authenticated || session.employee_id !== operator.employee_id ? "pointer-events-none opacity-60" : ""}`} inert={!authenticated || session.employee_id !== operator.employee_id}>
      <StocktakeWorkspace key={workspaceOperator.employee_id} variant={variant} token={session.token} operator={workspaceOperator.employee_id === operator.employee_id ? operator : workspaceOperator} enabled={authenticated && session.employee_id === operator.employee_id} />
    </div>}
  </div>;
}

function StocktakeWorkspace({ token, operator, enabled, variant }: { token: string; operator: Operator; enabled: boolean; variant: StocktakeVariant }) {
  const queryClient = useQueryClient();
  const { config: searchConfig } = useItemSearch();
  const navigate = useConfirmNavigation();
  const canManageRounds = canManageStocktakeRounds(operator);
  const [roundId, setRoundId] = useState("");
  const [section, setSection] = useState<Section>("count");
  const [startRequested, setStartRequested] = useState(false);
  const [search, setSearch] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [initialReady, setInitialReady] = useState(false);
  const [modelSlots, setModelSlots] = useState<number[]>([]);
  const [processSteps, setProcessSteps] = useState<string[]>([]);
  const [filterLogic, setFilterLogic] = useState<InventoryFilterLogic>("AND");
  const models = useModelsQuery({ enabled });
  const productModels = models.data ?? [];
  const [status, setStatus] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<StocktakeTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchControls = useRef<HTMLDivElement>(null);
  const [headerTop, setHeaderTop] = useState(54);
  const imageManifest = useItemImageManifest();
  const [selection, setSelection] = useState<Record<string, StocktakeTarget>>({});
  const [selectingAll, setSelectingAll] = useState(false);
  const selectionAbort = useRef<AbortController | null>(null);
  const selectionGeneration = useRef(0);
  const previewAttempt = useRef("");
  const [previewRetry, setPreviewRetry] = useState(0);
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovered, setRecovered] = useState<RecoveredStocktakeCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<"count_start" | "application_bulk_preview" | "application_bulk_apply" | null>(null);
  const busyRef = useRef(false);
  const [unknown, setUnknown] = useState<{ kind: "count_start" | "application_bulk_preview" | "application_bulk_apply"; key: string; target?: StocktakeTarget } | null>(null);
  const onChanged = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["stocktake"] }); }, [queryClient]);
  const previousToken = useRef(token);
  useEffect(() => {
    if (previousToken.current === token) return;
    previousToken.current = token;
    void queryClient.invalidateQueries({ queryKey: ["stocktake", operator.employee_id] });
  }, [token, operator.employee_id, queryClient]);
  useRegisterDirty("stocktake-command", busy || !!unknown, async () => { throw new Error("처리 결과를 먼저 확인해 주세요."); }, undefined, { mode: "auto-save", warnOnUnload: true });
  useEffect(() => {
    if (!canManageRounds) { setRoundId(""); setSection(previous => previous === "rounds" ? "count" : previous); }
  }, [canManageRounds]);
  const rounds = useQuery({ queryKey: ["stocktake", operator.employee_id, "rounds", canManageRounds ? "history" : "active"],
    queryFn: ({ signal }) => stocktakeApi.read<{ items: StocktakeRound[] }>(`/api/stocktakes/rounds${canManageRounds ? "" : "?active_only=true"}`, token, { signal }), retry: false, enabled });
  const allowedRounds = rounds.data?.items.filter(entry => canManageRounds || entry.status === "ACTIVE") ?? [];
  const activeRound = allowedRounds.find(entry => entry.status === "ACTIVE");
  const round = allowedRounds.find(entry => entry.round_id === roundId) ?? activeRound ?? (section === "rounds" ? allowedRounds[0] : null) ?? null;
  const showIdle = !activeRound && !roundId && section !== "rounds";
  const latestSummary = useQuery({ queryKey: ["stocktake", operator.employee_id, "latest-summary"],
    queryFn: ({ signal }) => stocktakeApi.read<StocktakeLatestSummaryResponse>("/api/stocktakes/rounds/latest-summary", token, { signal }),
    enabled: enabled && rounds.isSuccess && showIdle, retry: false });
  const roundStarted = () => {
    setStartRequested(false); setRoundId(""); setSection("count");
  };
  const progress = useQuery({ queryKey: ["stocktake", operator.employee_id, round?.round_id, "progress", "item-kpi-v1"],
    queryFn: ({ signal }) => stocktakeApi.read<StocktakeProgress>(`/api/stocktakes/rounds/${round!.round_id}/progress`, token, { signal }), enabled: enabled && !!round, retry: false });
  const filterStatus = status;
  const targetQueryKey = ["stocktake", operator.employee_id, round?.round_id, "targets", section === "waiting" ? "dashboard-v5-owned-waiting" : "dashboard-v4-item-kpi",
    departments.join(","), filterStatus, search, modelSlots.join(","), processSteps.join(","), filterLogic, searchConfig.version];
  const targets = useInfiniteQuery({
    queryKey: targetQueryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "50", search, logic: filterLogic, group_by_item: "true" });
      departments.forEach(department => params.append("departments", department));
      if (section !== "waiting" && (filterStatus === "UNCONFIRMED" || filterStatus === "CONFIRMED_WAITING")) params.set("status_group", filterStatus);
      else if (section !== "waiting" && filterStatus) params.set("status", filterStatus);
      modelSlots.forEach(slot => params.append("model_slots", String(slot)));
      processSteps.forEach(step => params.append("process_steps", step));
      if (pageParam) params.set("cursor", pageParam);
      return stocktakeApi.read<StocktakePage<StocktakeTarget>>(`/api/stocktakes/rounds/${round!.round_id}/${section === "waiting" ? "waiting-targets" : "targets"}?${params}`, token, { signal });
    },
    getNextPageParam: page => page.next_cursor ?? undefined,
    enabled: enabled && !!round && (section === "count" || section === "waiting"), retry: false,
  });
  useEffect(() => {
    if (rounds.isSuccess && (!round || (progress.isSuccess && targets.isSuccess))) setInitialReady(true);
  }, [rounds.isSuccess, round, progress.isSuccess, targets.isSuccess]);
  useEffect(() => {
    if ((targets.error as { code?: string } | null)?.code === "TARGET_CURSOR_STALE") {
      void queryClient.resetQueries({ queryKey: targetQueryKey, exact: true });
    }
  // Reset only a rejected cursor; filter keys already start their own first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.error, queryClient]);
  const rows = useMemo(() => targets.data?.pages.flatMap((page) => page.items) ?? [], [targets.data]);
  const selectedItem = rows.find(row => row.item_id === selectedTarget?.item_id);
  const locationTargets = selectedItem ? selectedItem.location_targets ?? [selectedItem]
    : selectedTarget?.location_targets ?? (selectedTarget ? [selectedTarget] : []);
  const freshTarget = locationTargets.find(row => row.target_id === selectedTarget?.target_id &&
    row.count?.count_id === selectedTarget?.count?.count_id) ?? selectedTarget;
  const imageCode = freshTarget?.current_item_code || freshTarget?.item_code;
  const imageFilename = imageCode ? imageManifest[imageCode] : undefined;
  const selected = Object.values(selection);
  const selectedItemCount = new Set(selected.map(location => location.item_id)).size;
  const selectionKey = selected.map(location => location.confirmation_revision_id).sort().join(",");
  const selectionKeyRef = useRef(selectionKey);
  selectionKeyRef.current = selectionKey;
  const selectionChanged = selected.some(location => {
    const item = rows.find(row => row.item_id === location.item_id);
    if (!item) return false;
    return !ownedWaitingLocations(item, operator.employee_id).some(current =>
      current.target_id === location.target_id && current.confirmation_revision_id === location.confirmation_revision_id);
  });
  useEffect(() => { if (selectionChanged && !busy && !unknown) setPreview(null); }, [selectionChanged, busy, unknown]);
  const waitingFilterKey = JSON.stringify([round?.round_id, search, departments, modelSlots, processSteps, filterLogic]);
  useEffect(() => {
    selectionGeneration.current += 1;
    selectionAbort.current?.abort();
    setSelectingAll(false); setSelection({}); setPreview(null); setError(""); previewAttempt.current = "";
  }, [waitingFilterKey]);
  useEffect(() => () => { selectionGeneration.current += 1; selectionAbort.current?.abort(); }, []);
  const finishAction = (kind: "count_start" | "application_bulk_preview" | "application_bulk_apply", result: unknown, target?: StocktakeTarget) => {
    if (kind === "count_start" && target) {
      const count = result as StocktakeCount;
      const updated = { ...target, status: count.status, count, version: count.version, confirmation_revision_id: count.confirmation_revision_id };
      setSelectedTarget({ ...updated, location_targets: locationTargets.map(entry => entry.target_id === target.target_id ? updated : entry) });
    } else if (kind === "application_bulk_preview") { setPreview(result as ApplyPreview); return; }
    else if (kind === "application_bulk_apply") { setPreview(null); setSelection({}); setNotice("선택한 확인 결과를 재고에 반영했습니다."); }
    onChanged();
  };
  const execute = async (kind: "count_start" | "application_bulk_preview" | "application_bulk_apply", path: string, payload: object, target?: StocktakeTarget) => {
    if (busyRef.current || unknown) return;
    busyRef.current = true; setBusy(true); setActiveAction(kind); setError(""); setNotice("");
    const key = crypto.randomUUID();
    const generation = selectionGeneration.current;
    const selectedKey = selectionKeyRef.current;
    try {
      const result = await stocktakeApi.command(kind, path, token, payload, { key });
      if (kind !== "application_bulk_preview" || (generation === selectionGeneration.current && selectedKey === selectionKeyRef.current)) {
        finishAction(kind, result, target);
      }
    }
    catch (failure) {
      if (kind === "application_bulk_preview" && generation !== selectionGeneration.current &&
          (failure as { code?: string })?.code !== "COMMAND_RESULT_UNKNOWN") return;
      setError(failure instanceof Error ? failure.message : "처리하지 못했습니다.");
      if ((failure as { code?: string })?.code === "COMMAND_RESULT_UNKNOWN") setUnknown({ kind, key, target });
      if ((failure as { code?: string })?.code === "PREVIEW_STALE") { setPreview(null); onChanged(); }
    } finally { busyRef.current = false; setBusy(false); setActiveAction(null); }
  };
  const recover = async () => {
    if (!unknown || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await stocktakeApi.read(`/api/stocktakes/commands/${encodeURIComponent(unknown.key)}?kind=${unknown.kind}`, token);
      finishAction(unknown.kind, result, unknown.target); setUnknown(null); setError("");
    } catch (failure) {
      if (isStocktakeNotApplied(failure)) { setUnknown(null); setError(""); setNotice("미반영으로 확정된 요청입니다."); onChanged(); }
      else setError("성공 기록을 아직 확인하지 못했습니다. 다시 전송하지 않았습니다. 잠시 후 결과를 확인해 주세요.");
    }
    finally { busyRef.current = false; setBusy(false); }
  };
  const closeDetail = useCallback(() => navigate(() => setDetailOpen(false)), [navigate]);
  const resetFilters = () => { setSearch(""); setDepartments([]); setStatus(""); setModelSlots([]); setProcessSteps([]); setFilterLogic("AND"); };
  const switchRound = (id: string) => navigate(() => { setRoundId(id); setDepartments([]); setSelectedTarget(null); setDetailOpen(false); setSelection({}); setPreview(null); });
  const openRoundManagement = (id = "", start = false) => navigate(() => {
    setRoundId(id); setSection("rounds"); setStartRequested(start); setDetailOpen(false);
  });
  const returnToIdle = () => navigate(() => {
    setRoundId(""); setSection("count"); setStartRequested(false); setDetailOpen(false);
    setSelectedTarget(null); setSelection({}); setPreview(null);
  });
  const selectTarget = (target: StocktakeTarget) => navigate(() => {
    if (section === "waiting") {
      if (busyRef.current || unknown || selectingAll) return;
      toggleSelection(target, true); setDetailOpen(true); return;
    }
    const options = target.location_targets ?? [target];
    const sameLocation = options.find(entry => entry.target_id === selectedTarget?.target_id);
    setSelectedTarget({ ...(sameLocation ?? target), location_targets: options });
    setDetailOpen(true);
  });
  const selectLocation = (target: StocktakeTarget): void => {
    if (target.target_id === freshTarget?.target_id) return;
    navigate(() => {
      const options = locationTargets.map(entry => entry.target_id === freshTarget?.target_id ? freshTarget : entry);
      setSelectedTarget({ ...target, location_targets: options });
    });
  };
  const toggleSelection = (target: StocktakeTarget, checked: boolean) => {
    if (busyRef.current || unknown || selectingAll) return;
    setPreview(null); setError(""); previewAttempt.current = "";
    setSelection(old => {
      const next = { ...old };
      if (checked) for (const location of ownedWaitingLocations(target, operator.employee_id)) next[location.target_id] = location;
      else for (const location of Object.values(next)) if (location.item_id === target.item_id) delete next[location.target_id];
      return next;
    });
    if (variant === "desktop") setDetailOpen(true);
  };
  const openPreview = () => navigate(() => {
    setDetailOpen(true);
  });
  const toggleAll = async (checked: boolean): Promise<void> => {
    if (busyRef.current || unknown || selectingAll) return;
    setPreview(null); setError(""); previewAttempt.current = "";
    if (!checked) { setSelection({}); return; }
    const controller = new AbortController();
    selectionAbort.current = controller;
    const generation = selectionGeneration.current;
    setSelectingAll(true);
    const params = new URLSearchParams({ search, logic: filterLogic });
    departments.forEach(value => params.append("departments", value));
    modelSlots.forEach(value => params.append("model_slots", String(value)));
    processSteps.forEach(value => params.append("process_steps", value));
    try {
      const result = await stocktakeApi.read<StocktakeWaitingSelection>(
        `/api/stocktakes/rounds/${round!.round_id}/waiting-selection?${params}`, token, { signal: controller.signal });
      if (controller.signal.aborted || generation !== selectionGeneration.current) return;
      setSelection(Object.fromEntries(result.items.filter(location =>
        ownedWaitingLocations(location, operator.employee_id).length > 0).map(location => [location.target_id, location])));
      if (variant === "desktop") setDetailOpen(true);
    } catch (failure) {
      if (!controller.signal.aborted && generation === selectionGeneration.current) setError(failure instanceof Error ? failure.message : "전체 선택을 조회하지 못했습니다.");
    } finally {
      if (generation === selectionGeneration.current) setSelectingAll(false);
    }
  };
  useEffect(() => {
    if (section !== "waiting" || !detailOpen || !selectionKey || selectionChanged || busy || unknown || selectingAll || preview) return;
    const attempt = `${selectionKey}:${previewRetry}`;
    if (previewAttempt.current === attempt) return;
    previewAttempt.current = attempt;
    void execute("application_bulk_preview", `/api/stocktakes/rounds/${round!.round_id}/application-bulk-previews`,
      { confirmation_revision_ids: selected.map(entry => entry.confirmation_revision_id) });
  // Selection identity, not background query data, owns the automatic preview request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, detailOpen, selectionKey, selectionChanged, previewRetry, busy, unknown, selectingAll, preview]);
  const working = section === "count" || section === "waiting";
  useEffect(() => {
    const controls = searchControls.current;
    if (!controls) return;
    const measure = () => setHeaderTop(Math.ceil(controls.getBoundingClientRect().height) + (variant === "mobile" ? 8 : 0));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [working, round?.round_id, variant, initialReady]);
  const filtered = !!(search || departments.length || modelSlots.length || processSteps.length || (section === "count" && status));
  const activeKpi = section === "count" ? (Object.entries(KPI_STATUS).find(([, value]) => value === status)?.[0] as StocktakeKpi | undefined) ?? null : null;
  const selectKpi = (key: StocktakeKpi): void => {
    const update = () => { setSection("count"); setStatus(KPI_STATUS[key]); };
    if (section === "count") update(); else navigate(update);
  };
  const recovery = <StocktakeCommandRecovery token={token} enabled={enabled} canManageRounds={canManageRounds} onRecovered={outcome => {
    setRecovered(outcome);
    if (unknown?.key === outcome.entry.key && unknown.kind === outcome.entry.kind) {
      if (outcome.resolution === "COMPLETED") finishAction(unknown.kind, outcome.result, unknown.target);
      setUnknown(null); setError("");
    }
    if (startRequested && outcome.entry.kind === "round_start" && outcome.resolution === "COMPLETED") roundStarted();
    onChanged();
  }} />;
  const categoryFilters = working && <InventoryFilters open={filtersOpen} panelId="stocktake-filters" className={variant === "desktop" ? summaryStyles.filters : undefined}
      selectedDepts={departments} departmentOptions={STOCKTAKE_DEPARTMENTS} showDepartmentFilterBasis={false}
      departmentFilterBasis="code" toggleDept={name => setDepartments(old => old.includes(name) ? old.filter(value => value !== name) : [...old, name].sort())}
      onDepartmentFilterBasisChange={() => {}} onClearDepts={() => setDepartments([])}
      selectedModels={productModels.filter(model => modelSlots.includes(model.slot)).map(model => model.model_name ?? "")}
      productModels={productModels} toggleModel={name => {
        const slot = productModels.find(model => model.model_name === name)?.slot;
        if (slot !== undefined) setModelSlots(old => old.includes(slot) ? old.filter(value => value !== slot) : [...old, slot].sort((a, b) => a - b));
      }}
      onClearModels={() => setModelSlots([])} selectedProcessSteps={processSteps}
      toggleProcessStep={step => setProcessSteps(old => old.includes(step) ? old.filter(value => value !== step) : [...old, step].sort())}
      onClearProcessSteps={() => setProcessSteps([])} showDisused={processSteps.includes("OBSOLETE")}
      toggleDisused={() => setProcessSteps(old => old.includes("OBSOLETE") ? old.filter(step => step !== "OBSOLETE") : [...old, "OBSOLETE"].sort())}
      onResetAll={resetFilters} isAnyFilterActive={filtered || filterLogic !== "AND"} />;
  const toolbar = <fieldset disabled={busy || !!unknown} className="min-w-0 space-y-2">
    <StocktakeToolbarMenu variant={variant} section={section} canManageRounds={canManageRounds} waitingCount={progress.data?.my_waiting?.items} disabled={busy || !!unknown || selectingAll}
      onChange={id => { if (id === "rounds" && !canManageRounds) return; navigate(() => { setSection(id); setDetailOpen(false); }); }}
      filterControl={working && variant === "desktop" && <InventoryFilterToggleButton filtersOpen={filtersOpen} logic={filterLogic} onLogicChange={setFilterLogic} controlsId="stocktake-filters" ariaLabel={filtersOpen ? "필터 닫기" : "필터 열기"} onToggle={() => setFiltersOpen(open => !open)} />} />
    {variant === "desktop" && categoryFilters}
  </fieldset>;
  const alerts = <>
    {(rounds.error || progress.error || models.error || error || (working && targets.error)) && <p role="alert" className="rounded-[14px] border border-[var(--c-border)] bg-[var(--c-s1)] p-3 text-sm text-[var(--c-red)]">{error || rounds.error?.message || progress.error?.message || models.error?.message || targets.error?.message}</p>}
    {notice && <p role="status" className="rounded-[14px] bg-[var(--c-s1)] p-3 text-sm text-[var(--c-green)]">{notice}</p>}
    {unknown && <button type="button" className={STOCKTAKE_BUTTON} disabled={busy} onClick={() => void recover()}>처리 결과 확인</button>}
  </>;
  const reviewItems = [...new Map((preview?.entries ?? []).map(entry => {
    const location = selection[entry.target_id];
    const itemId = location?.item_id ?? entry.item_id ?? entry.target_id;
    return [itemId, location?.current_item_name || location?.item_name || entry.item_name || itemId];
  })).entries()];
  const selectionActions = <section className="space-y-3" aria-label="선택 반영 검토">
    {selectionChanged && <p role="alert" className="p-3 text-sm text-[var(--c-red)]">확인 결과가 변경된 품목을 다시 선택해 주세요.</p>}
    {busy && !preview && <p role="status" className="p-3 text-sm text-[var(--c-muted2)]">반영할 수량을 확인하는 중입니다.</p>}
    {!selected.length && <p className="p-3 text-sm text-[var(--c-muted2)]">반영할 품목을 선택해 주세요.</p>}
    {!preview && !selectionChanged && selected.length > 0 && error && !unknown && !busy && <button type="button" className={STOCKTAKE_BUTTON} onClick={() => { setError(""); setPreviewRetry(value => value + 1); }}>다시 검토</button>}
    {preview && <>
      {reviewItems.map(([itemId, name]) => <div key={itemId} className="rounded-[14px] border border-[var(--c-border)] bg-[var(--c-s2)] p-3">
        <h2 className="break-words text-sm font-semibold">{name}</h2>
        {preview.entries.filter(entry => (selection[entry.target_id]?.item_id ?? entry.item_id ?? entry.target_id) === itemId).map(entry =>
          <section key={entry.target_id} className="mt-3" aria-label={`${name} · ${selection[entry.target_id]?.scope_name ?? entry.scope_name ?? entry.scope_id}`}>
            <p className="break-words text-sm font-semibold">{selection[entry.target_id]?.scope_name ?? entry.scope_name ?? entry.scope_id} · 확인자 {entry.confirmed_name}</p>
            <p className="mt-1 text-xs text-[var(--c-muted2)]">확인 시각 {formatKstDateTime(entry.confirmed_at)}</p>
            <table className="mt-2 w-full table-fixed text-right text-sm tabular-nums">
              <caption className="sr-only">분류별 반영 전후 수량</caption>
              <thead className="text-xs text-[var(--c-muted2)]"><tr><th className="py-2 text-left">분류</th><th>현재</th><th>계수</th><th>차이</th><th>예약</th></tr></thead>
              <tbody>{CATEGORIES.map(key => <tr key={key} className="border-t border-[var(--c-border)]"><th className="py-2 text-left font-medium">{CATEGORY_LABELS[key]}</th><td>{entry.before[key]}</td><td>{entry.after[key]}</td><td className={(entry.deltas[key] ?? 0) < 0 ? "font-semibold text-[var(--c-red)]" : (entry.deltas[key] ?? 0) > 0 ? "font-semibold text-[var(--c-blue)]" : ""}>{(entry.deltas[key] ?? 0) > 0 ? "+" : ""}{entry.deltas[key]}</td><td>{entry.reservations[key]}</td></tr>)}</tbody>
            </table>
            {entry.held.map((held, index) => <p key={index} className="mt-2 break-words text-sm text-[var(--c-red)]">보류: {held.category ? CATEGORY_LABELS[held.category as keyof typeof CATEGORY_LABELS] : "수량"} {held.counted} / 예약 {held.reserved} · {held.code}</p>)}
          </section>)}
      </div>)}
      <div className="sticky bottom-0 bg-[var(--c-s1)] py-2"><button type="button" className={`${STOCKTAKE_BUTTON} w-full bg-[var(--c-blue)] text-white`} disabled={!preview.can_apply || busy || !!unknown} onClick={() => void execute("application_bulk_apply", `/api/stocktakes/rounds/${round!.round_id}/bulk-applications`, { preview_id: preview.preview_id, preview_hash: preview.preview_hash })}>재고 반영</button></div>
    </>}
  </section>;
  const detailCard = variant === "desktop" ? "rounded-[28px] border border-[var(--c-border)] bg-[var(--c-s2)] p-5" : STOCKTAKE_CARD;
  const detailPhoto = variant === "desktop" && imageFilename && freshTarget ? <section className="flex items-center justify-center rounded-[28px] border border-[var(--c-border)] bg-[var(--c-s2)] p-4"><StocktakeItemPhoto filename={imageFilename} name={freshTarget.current_item_name || freshTarget.item_name} size="panel" /></section> : null;
  const detail = <>
    {section === "waiting" && selectionActions}
    {section === "count" && freshTarget && <>
      <section className={detailCard} aria-label="입력할 조사 위치">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} />조사 위치 선택</h2>
        <div className="grid grid-cols-2 gap-2">
          {locationTargets.map(location => <div key={location.target_id} className="min-w-0">
            <button type="button" aria-pressed={freshTarget.target_id === location.target_id}
              disabled={busy || !!unknown} onClick={() => selectLocation(location)}
              className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-[14px] border px-2 py-3 text-sm font-semibold transition ${freshTarget.target_id === location.target_id ? "border-[var(--c-blue)] bg-[color-mix(in_srgb,var(--c-blue)_12%,transparent)] text-[var(--c-blue)]" : "border-[var(--c-border)] bg-[var(--c-s1)] text-[var(--c-muted2)]"}`}>
              <span>{location.scope_name}</span>
              <span className="text-xs font-medium">{STOCKTAKE_STATUS_LABEL[location.target_id === freshTarget.target_id ? freshTarget.status : location.status]}</span>
            </button>
          </div>)}
        </div>
      </section>
      {freshTarget.status !== "DRAFT" && detailPhoto}
      {round?.status === "ACTIVE" && ["UNCOUNTED", "APPLIED", "ABANDONED"].includes(freshTarget.status) && <section className={detailCard}>
        {variant === "mobile" ? <div className="flex items-center gap-3"><StocktakeItemPhoto filename={imageFilename} name={freshTarget.current_item_name || freshTarget.item_name} /><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{freshTarget.current_item_name || freshTarget.item_name}</h2>
          <p className="mt-1 break-all text-xs text-[var(--c-muted2)]">{freshTarget.current_item_code || freshTarget.item_code} · {freshTarget.scope_name}</p></div></div> : <h2 className="text-sm font-bold text-[var(--c-muted2)]">조사 시작</h2>}
        <p className="my-4 text-sm leading-relaxed">{freshTarget.status === "UNCOUNTED" ? "조사" : "재조사"} 중에는 이 품목·위치의 재고 이동이 제한됩니다.</p>
        <button type="button" className={`${STOCKTAKE_BUTTON} w-full bg-[var(--c-blue)] text-white`} disabled={busy || !!unknown} aria-busy={activeAction === "count_start"} onClick={() => void execute("count_start", `/api/stocktakes/targets/${freshTarget.target_id}/counts`, { expected_target_version: freshTarget.target_version, round_epoch: round!.epoch }, freshTarget)}>{activeAction === "count_start" ? "처리 중…" : freshTarget.status === "UNCOUNTED" ? "계수 시작" : "재조사"}</button>
      </section>}
      {freshTarget.count && <StocktakeCountEditor presentation={variant === "desktop" ? "panel" : "card"} imageFilename={imageFilename} key={freshTarget.count.count_id} target={freshTarget} token={token} operator={operator} onChanged={onChanged} enabled={enabled} recovered={recovered} />}
      {freshTarget.status === "DRAFT" && detailPhoto}
      {!freshTarget.count && round?.status !== "ACTIVE" && <section className={STOCKTAKE_CARD}>
        <div className="flex items-center gap-3"><StocktakeItemPhoto filename={imageFilename} name={freshTarget.current_item_name || freshTarget.item_name} /><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{freshTarget.current_item_name || freshTarget.item_name}</h2><p className="mt-1 break-all text-xs text-[var(--c-muted2)]">{freshTarget.current_item_code || freshTarget.item_code} · {freshTarget.scope_name}</p></div></div>
        <p className="mt-4 text-sm text-[var(--c-muted2)]">{STOCKTAKE_STATUS_LABEL[freshTarget.status]} · 종료된 회차입니다. 이 대상의 계수 기록이 없습니다.</p>
      </section>}
    </>}
  </>;
  if (!initialReady) {
    const failure = rounds.error || progress.error || targets.error;
    if (failure) return <ReadFailure message={failure.message} onRetry={() => {
      if (rounds.error) void rounds.refetch();
      if (progress.error) void progress.refetch();
      if (targets.error) void targets.refetch();
    }} />;
    return <StocktakeLoadingSkeleton variant={variant} canManageRounds={canManageRounds} />;
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" style={{ "--stocktake-header-top": `${headerTop}px` } as CSSProperties}>
    <div className={`shrink-0 space-y-2 empty:hidden ${variant === "mobile" ? "px-3" : "pr-4"}`}>{recovery}{alerts}</div>
    {showIdle && <div className={`min-h-0 flex-1 overflow-y-auto ${variant === "mobile" ? "px-3 pb-4" : "pr-4 pb-4"}`}>
      <StocktakeIdlePanel summary={latestSummary.data?.summary} loading={latestSummary.isPending} error={latestSummary.error}
        disabled={busy || !!unknown} onRetry={() => void latestSummary.refetch()}
        onStart={canManageRounds ? () => openRoundManagement("", true) : undefined}
        onHistory={canManageRounds ? () => openRoundManagement(allowedRounds[0]?.round_id) : undefined}
        onDetails={canManageRounds ? id => openRoundManagement(id) : undefined} />
    </div>}
    <div hidden={showIdle} aria-hidden={showIdle || undefined} className={showIdle ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"} inert={showIdle}>
    {!activeRound && !showIdle && <div className={`pb-2 ${variant === "mobile" ? "px-3" : "pr-4"}`}><button type="button" className={STOCKTAKE_BUTTON} disabled={busy || !!unknown} onClick={returnToIdle}>대기 화면으로</button></div>}
    <StocktakeLayout variant={variant} detailKey={section === "waiting" ? "review" : freshTarget?.target_id} detailOpen={working && detailOpen} detail={detail} onClose={closeDetail}
      detailTone={section === "count" ? stocktakeStatusTone(stocktakeItemStatus(locationTargets)) : undefined}
      detailTitle={section === "waiting" ? "선택 반영 검토" : freshTarget?.current_item_name || freshTarget?.item_name}
      detailSubtitle={section === "waiting" ? undefined : freshTarget ? `${freshTarget.current_item_code || freshTarget.item_code || "코드 없음"} · ${freshTarget.scope_name}` : undefined}
      detailBadge={section === "count" && freshTarget ? <span className="rounded-full bg-[var(--c-s2)] px-2 py-0.5 text-xs font-semibold">{STOCKTAKE_STATUS_LABEL[freshTarget.status]}</span> : undefined}
      footer={section === "waiting" && !detailOpen && selected.length > 0 ? <div className="shrink-0 px-3 pt-2"><button type="button" className={`${STOCKTAKE_BUTTON} w-full bg-[var(--c-blue)] text-white`} disabled={busy || !!unknown} onClick={openPreview}>선택 {selectedItemCount}개 검토</button></div> : undefined}>
      {round ? <StocktakeSummary activeKpi={activeKpi} onKpiChange={selectKpi} summary={progress.data?.item_summary} loading={progress.isPending} variant={variant}>{toolbar}</StocktakeSummary> : toolbar}
      {working && variant === "mobile" && <>
        <StocktakeSearchHeader variant={variant} headerRef={searchControls} value={search} onChange={setSearch} count={rows.length} filtered={filtered} onReset={resetFilters} disabled={busy || !!unknown}
          mobileToolbar={<InventorySearchToolbar value={search} onChange={setSearch} placeholder="품명 · 품목 코드 검색" searchLabel="품목 검색"
            filtersOpen={filtersOpen} filterLogic={filterLogic} onFilterLogicChange={setFilterLogic} onToggleFilters={() => setFiltersOpen(open => !open)}
            isFiltered={filtered || filterLogic !== "AND"} controlsId="stocktake-filters" disabled={busy || !!unknown}
            activeFilterCount={departments.length + modelSlots.length + processSteps.length} />} />
        {filtersOpen && <fieldset disabled={busy || !!unknown} className="min-w-0">{categoryFilters}</fieldset>}
      </>}
      {working && (round ? <>
        <StocktakeTargetList variant={variant} rows={rows} waiting={section === "waiting"} waitingOwnerId={operator.employee_id} selectionTotal={targets.data?.pages[0]?.total_items} onToggleAll={checked => void toggleAll(checked)} loading={targets.isPending} selectedTargetId={selectedTarget?.target_id} selection={selection} busy={busy || !!unknown || selectingAll}
          searchHeader={variant === "desktop" ? <StocktakeSearchHeader variant={variant} headerRef={searchControls} value={search} onChange={setSearch} count={rows.length} filtered={filtered} onReset={resetFilters} disabled={busy || !!unknown} /> : undefined}
          imageManifest={imageManifest} hasNextPage={targets.hasNextPage} fetchingNextPage={targets.isFetchingNextPage} filtered={filtered} onSelect={selectTarget} onToggle={toggleSelection} onMore={() => void targets.fetchNextPage()} onReset={resetFilters} />
      </> : <p className={STOCKTAKE_CARD}>부서 결재 담당자가 회차를 시작하면 조사할 수 있습니다.</p>)}
      {section === "rounds" && canManageRounds && <StocktakeRoundHistory token={token} round={round} rounds={allowedRounds} admin={canManageStocktakeRounds(operator)} disabled={busy || !!unknown} onSelectRound={switchRound}
        menuVisibility={<StocktakeMenuVisibilityCard key={token} operator={operator} token={token} disabled={busy || !!unknown} />}
        management={<StocktakeManagement token={token} operator={operator} round={round} section="rounds" onChanged={onChanged} recovered={recovered} focusStart={startRequested} onStarted={startRequested ? roundStarted : undefined} />} />}
      {section === "progress" && <StocktakeManagement token={token} operator={operator} round={round} section="progress" onChanged={onChanged} recovered={recovered} />}
    </StocktakeLayout>
    </div>
  </div>;
}
