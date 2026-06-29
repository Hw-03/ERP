"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  History,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { api, type Item, type ShippingBomLineInput, type ShippingBomMatchResponse, type ShippingCompanionLineInput, type ShippingRequest, type ShippingRequestStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

type SectionTab = "request" | "prep" | "history";
type ViewMode = "hub" | "requestList" | "requestDetail" | "requestWork" | "prepList" | "prepWork" | "historyList" | "historyWork";
type DraftLine = ShippingBomLineInput & { key: string; included: boolean; origin: "DEFAULT" | "CUSTOM" };
type PendingAction =
  | "load"
  | "save"
  | "send"
  | "match"
  | "checklist"
  | "clear"
  | "prepare"
  | "cancel"
  | "pickup"
  | null;

type ConfirmAction =
  | { kind: "prepare"; request: ShippingRequest; companionLines: ShippingCompanionLineInput[] }
  | { kind: "cancel"; request: ShippingRequest }
  | { kind: "pickup"; request: ShippingRequest };
const STATUS_LABEL: Record<ShippingRequestStatus, string> = {
  REQUESTED: "요청",
  PREPARING: "준비 중",
  PREPARED: "준비 완료",
  PICKED_UP: "픽업 완료",
};

const STATUS_TONE: Record<ShippingRequestStatus, string> = {
  REQUESTED: LEGACY_COLORS.blue,
  PREPARING: LEGACY_COLORS.green,
  PREPARED: LEGACY_COLORS.yellow,
  PICKED_UP: LEGACY_COLORS.purple,
};
const TX_TYPE_LABEL: Record<string, string> = {
  BACKFLUSH: "자재 차감",
  PRODUCE: "생산 반영",
  SHIP: "출하 차감",
};

const PHASE_LABEL: Record<string, string> = {
  PREPARE: "준비 완료",
  PICKUP: "픽업 완료",
};

function txTypeLabel(type: string) {
  return TX_TYPE_LABEL[type] ?? type;
}

function phaseLabel(phase: string | null) {
  return phase ? PHASE_LABEL[phase] ?? phase : "일반";
}

function txTone(type: string, cancelled: boolean) {
  if (cancelled) return LEGACY_COLORS.red;
  if (type === "SHIP") return LEGACY_COLORS.purple;
  if (type === "PRODUCE") return LEGACY_COLORS.green;
  if (type === "BACKFLUSH") return LEGACY_COLORS.yellow;
  return LEGACY_COLORS.blue;
}

function lineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toNumber(value: string | number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function itemLabel(item: Item | undefined) {
  if (!item) return "품목 선택";
  return `${item.mes_code ?? item.process_type_code ?? "-"} · ${item.item_name}`;
}
function filterItems(items: Item[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [item.mes_code, item.process_type_code, item.item_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

function requestBomLines(req: ShippingRequest): DraftLine[] {
  return req.bom_lines.map((line) => ({
    key: line.line_id,
    parent_stage: line.parent_stage,
    child_item_id: line.child_item_id,
    quantity: line.quantity,
    unit: line.unit,
    included: line.included,
    origin: line.origin,
  }));
}

export function DesktopShippingView({ onStatusChange }: { onStatusChange: (status: string) => void }) {
  const [view, setView] = useState<ViewMode>("hub");
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState<ShippingRequest[]>([]);
  const [history, setHistory] = useState<ShippingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [basePfId, setBasePfId] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [customPaName, setCustomPaName] = useState("");
  const [customPfName, setCustomPfName] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [matchResult, setMatchResult] = useState<ShippingBomMatchResponse | null>(null);
  const [prepareModalFor, setPrepareModalFor] = useState<ShippingRequest | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [companionDraft, setCompanionDraft] = useState<Array<{ key: string; item_id: string; quantity: number; unit: string }>>([]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);
  const pfItems = useMemo(() => items.filter((item) => item.process_type_code === "PF" && !item.deleted_at), [items]);
  const lineItemOptions = useMemo(() => items.filter((item) => !item.deleted_at), [items]);
  const activeRequests = useMemo(() => requests.filter((req) => req.status !== "PICKED_UP"), [requests]);
  const prepRequests = useMemo(
    () => requests.filter((req) => req.status === "PREPARING" || req.status === "PREPARED"),
    [requests],
  );
  const selectedRequest = useMemo(
    () => (editingId ? requests.find((req) => req.request_id === editingId) ?? null : null),
    [editingId, requests],
  );
  const selectedPrep = useMemo(
    () => prepRequests.find((req) => req.request_id === selectedPrepId) ?? prepRequests[0] ?? null,
    [prepRequests, selectedPrepId],
  );
  const selectedHistory = useMemo(
    () => history.find((req) => req.request_id === selectedHistoryId) ?? history[0] ?? null,
    [history, selectedHistoryId],
  );
  const canEditDraft = !selectedRequest || selectedRequest.status === "REQUESTED" || selectedRequest.status === "PREPARING";

  const upsertRequest = useCallback((next: ShippingRequest) => {
    setRequests((prev) => {
      const rest = prev.filter((row) => row.request_id !== next.request_id);
      return [next, ...rest];
    });
    if (next.status === "PICKED_UP") {
      setHistory((prev) => [next, ...prev.filter((row) => row.request_id !== next.request_id)]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPending("load");
    try {
      const [nextItems, nextRequests, nextHistory] = await Promise.all([
        api.getItems({ limit: 2000 }),
        api.getShippingRequests(),
        api.getShippingHistory(),
      ]);
      setItems(nextItems);
      setRequests(nextRequests);
      setHistory(nextHistory);
      setSelectedPrepId((current) => current ?? nextRequests.find((req) => req.status === "PREPARING" || req.status === "PREPARED")?.request_id ?? null);
      setSelectedHistoryId((current) => current ?? nextHistory[0]?.request_id ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "출하 데이터를 불러오지 못했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function clearDraft() {
    setView("requestWork");
    setEditingId(null);
    setBasePfId("");
    setRequestedBy("");
    setCustomPaName("");
    setCustomPfName("");
    setNotes("");
    setDraftLines([]);
    setMatchResult(null);
  }

  function loadRequestIntoDraft(req: ShippingRequest, nextView: ViewMode = "requestWork") {
    setEditingId(req.request_id);
    setBasePfId(req.base_pf_item_id);
    setRequestedBy(req.requested_by_name ?? "");
    setCustomPaName(req.custom_pa_name ?? "");
    setCustomPfName(req.custom_pf_name ?? "");
    setNotes(req.notes ?? "");
    setDraftLines(requestBomLines(req));
    setMatchResult(null);
    setView(nextView);
  }

  async function loadDefaultBom(nextBasePfId: string) {
    if (!nextBasePfId) {
      setDraftLines([]);
      return;
    }
    setPending("load");
    setError(null);
    try {
      const pfRows = await api.getBOM(nextBasePfId);
      const lines: DraftLine[] = pfRows.map((row) => ({
        key: row.bom_id,
        parent_stage: "PF",
        child_item_id: row.child_item_id,
        quantity: row.quantity,
        unit: row.unit,
        included: true,
        origin: "DEFAULT",
      }));
      const paChild = pfRows
        .map((row) => itemById.get(row.child_item_id))
        .find((item) => item?.process_type_code === "PA");
      if (paChild) {
        const paRows = await api.getBOM(paChild.item_id);
        lines.push(
          ...paRows.map((row) => ({
            key: row.bom_id,
            parent_stage: "PA" as const,
            child_item_id: row.child_item_id,
            quantity: row.quantity,
            unit: row.unit,
            included: true,
            origin: "DEFAULT" as const,
          })),
        );
      }
      setDraftLines(lines);
      setMatchResult(null);
      onStatusChange("기본 BOM을 출하 요청에 불러왔습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "기본 BOM을 불러오지 못했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }

  async function handleBasePfChange(nextBasePfId: string) {
    setBasePfId(nextBasePfId);
    setEditingId(null);
    await loadDefaultBom(nextBasePfId);
  }

  function draftPayload() {
    return {
      requested_by_name: requestedBy.trim() || null,
      custom_pa_name: customPaName.trim() || null,
      custom_pf_name: customPfName.trim() || null,
      notes: notes.trim() || null,
      bom_lines: draftLines
        .filter((line) => line.child_item_id && Number(line.quantity) > 0)
        .map((line) => ({
          parent_stage: line.parent_stage,
          child_item_id: line.child_item_id,
          quantity: Number(line.quantity),
          unit: line.unit || itemById.get(line.child_item_id)?.unit || "EA",
          included: line.included,
          origin: line.origin,
        })),
    };
  }

  async function saveRequest() {
    if (!basePfId) {
      onStatusChange("기준 PF를 먼저 선택하세요.");
      return null;
    }
    setPending("save");
    setError(null);
    try {
      const payload = draftPayload();
      const saved = editingId
        ? await api.updateShippingRequest(editingId, payload)
        : await api.createShippingRequest({ base_pf_item_id: basePfId, ...payload });
      upsertRequest(saved);
      setEditingId(saved.request_id);
      onStatusChange(editingId ? "출하 요청을 수정했습니다." : "출하 요청을 생성했습니다.");
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "출하 요청 저장에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
      return null;
    } finally {
      setPending(null);
    }
  }

  async function ensureReadyForPrep() {
    if (!basePfId) {
      onStatusChange("기준 PF를 먼저 선택하세요.");
      return false;
    }
    setPending("match");
    setError(null);
    try {
      const result = await api.matchShippingBom({
        base_pf_item_id: basePfId,
        bom_lines: draftPayload().bom_lines,
      });
      setMatchResult(result);
      const missingPaName = result.requires_pa_name && !customPaName.trim();
      const missingPfName = result.requires_pf_name && !customPfName.trim();
      if (missingPaName || missingPfName) {
        const required = [missingPaName ? "PA" : null, missingPfName ? "PF" : null].filter(Boolean).join("/");
        const msg = `동일 BOM 후보를 기준으로 새 ${required} 이름을 입력해야 준비 중으로 보낼 수 있습니다.`;
        setError(msg);
        onStatusChange(msg);
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "동일 BOM 확인에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function sendToPrep() {
    if (!(await ensureReadyForPrep())) return;
    const saved = await saveRequest();
    if (!saved) return;
    if (saved.status !== "REQUESTED") {
      onStatusChange("요청 상태에서만 준비 중으로 보낼 수 있습니다.");
      return;
    }
    setPending("send");
    setError(null);
    try {
      const next = await api.sendShippingToPrep(saved.request_id);
      upsertRequest(next);
      setSelectedPrepId(next.request_id);
      setView("prepWork");
      onStatusChange("출하 요청을 준비 중으로 넘겼습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "준비 중 전환에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }
  async function matchBom() {
    if (!basePfId) {
      onStatusChange("기준 PF를 먼저 선택하세요.");
      return;
    }
    setPending("match");
    setError(null);
    try {
      const result = await api.matchShippingBom({
        base_pf_item_id: basePfId,
        bom_lines: draftPayload().bom_lines,
      });
      setMatchResult(result);
      onStatusChange(result.matched_pf_item_id ? "동일 BOM 후보를 찾았습니다." : "동일한 PA/PF BOM 후보가 없습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "동일 BOM 확인에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }

  async function updateChecklist(req: ShippingRequest, itemId: string, checked: boolean) {
    setPending("checklist");
    try {
      const next = await api.updateShippingChecklist(req.request_id, { checks: [{ item_id: itemId, checked }] });
      upsertRequest(next);
      setSelectedPrepId(next.request_id);
    } catch (err) {
      onStatusChange(err instanceof Error ? err.message : "체크리스트 수정에 실패했습니다.");
    } finally {
      setPending(null);
    }
  }

  async function clearChecklist(req: ShippingRequest) {
    setPending("clear");
    try {
      const next = await api.clearShippingChecklist(req.request_id);
      upsertRequest(next);
      setSelectedPrepId(next.request_id);
      onStatusChange("체크리스트를 전체 해제했습니다.");
    } catch (err) {
      onStatusChange(err instanceof Error ? err.message : "체크리스트 전체 해제에 실패했습니다.");
    } finally {
      setPending(null);
    }
  }

  function completePrepare() {
    if (!prepareModalFor) return;
    const companionLines = companionDraft
      .filter((line) => line.item_id && line.quantity > 0)
      .map((line) => ({ item_id: line.item_id, quantity: line.quantity, unit: line.unit || itemById.get(line.item_id)?.unit || "EA" }));
    setConfirmAction({ kind: "prepare", request: prepareModalFor, companionLines });
  }

  function cancelPrepare(req: ShippingRequest) {
    setConfirmAction({ kind: "cancel", request: req });
  }

  function completePickup(req: ShippingRequest) {
    setConfirmAction({ kind: "pickup", request: req });
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setPending(action.kind === "prepare" ? "prepare" : action.kind === "cancel" ? "cancel" : "pickup");
    setError(null);
    try {
      if (action.kind === "prepare") {
        const next = await api.prepareShippingComplete(action.request.request_id, { companion_lines: action.companionLines });
        upsertRequest(next);
        setSelectedPrepId(next.request_id);
        setPrepareModalFor(null);
        setCompanionDraft([]);
        onStatusChange("출하 준비 완료 처리했습니다.");
      } else if (action.kind === "cancel") {
        const next = await api.cancelShippingPrepare(action.request.request_id, { reason: "출하 준비 변경" });
        upsertRequest(next);
        setSelectedPrepId(next.request_id);
        onStatusChange("준비 완료를 취소했습니다. 요청과 BOM을 다시 수정할 수 있습니다.");
      } else {
        const next = await api.completeShippingPickup(action.request.request_id);
        upsertRequest(next);
        setSelectedHistoryId(next.request_id);
        setView("historyWork");
        onStatusChange("픽업 완료 처리했습니다.");
      }
      setConfirmAction(null);
    } catch (err) {
      const fallback = action.kind === "prepare" ? "준비 완료 처리에 실패했습니다." : action.kind === "cancel" ? "준비 완료 취소에 실패했습니다." : "픽업 완료 처리에 실패했습니다.";
      const msg = err instanceof Error ? err.message : fallback;
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }
  function updateDraftLine(key: string, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setMatchResult(null);
  }

  function addDraftLine(stage: "PA" | "PF") {
    setDraftLines((prev) => [...prev, { key: lineKey(), parent_stage: stage, child_item_id: "", quantity: 1, unit: "EA", included: true, origin: "CUSTOM" }]);
    setMatchResult(null);
  }

  function removeDraftLine(key: string) {
    setDraftLines((prev) => prev.filter((line) => line.key !== key));
    setMatchResult(null);
  }

  useEffect(() => {
    if (view !== "requestWork" || !basePfId || draftLines.length === 0) return;
    const bomLines = draftLines
      .filter((line) => line.child_item_id && Number(line.quantity) > 0)
      .map((line) => ({
        parent_stage: line.parent_stage,
        child_item_id: line.child_item_id,
        quantity: Number(line.quantity),
        unit: line.unit || itemById.get(line.child_item_id)?.unit || "EA",
        included: line.included,
        origin: line.origin,
      }));
    if (bomLines.length === 0) return;

    const timer = window.setTimeout(() => {
      api.matchShippingBom({ base_pf_item_id: basePfId, bom_lines: bomLines })
        .then((result) => setMatchResult(result))
        .catch(() => undefined);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [basePfId, draftLines, itemById, view]);

  function openSection(next: SectionTab) {
    setView(next === "request" ? "requestList" : next === "prep" ? "prepList" : "historyList");
  }

  function renderActiveView() {
    const counts = {
      request: activeRequests.length,
      prep: prepRequests.length,
      history: history.length,
    };

    if (view === "hub") {
      return <ShippingHubEntry counts={counts} onOpen={openSection} />;
    }

    if (view === "requestList") {
      return (
        <RequestListEntry
          requests={activeRequests}
          onBack={() => setView("hub")}
          onNew={clearDraft}
          onOpen={(req) => loadRequestIntoDraft(req, "requestDetail")}
        />
      );
    }

    if (view === "requestDetail") {
      return (
        <RequestDetailEntry
          request={selectedRequest}
          onBack={() => setView("requestList")}
          onEdit={(req) => loadRequestIntoDraft(req, "requestWork")}
        />
      );
    }

    if (view === "requestWork") {
      return (
        <div className="grid gap-3">
          <ViewHeader
            title={editingId ? "출하 요청 수정" : "출하 요청 작성"}
            subtitle="PF 선택 후 PF/PA 구성품을 조정합니다."
            onBack={() => setView(selectedRequest ? "requestDetail" : "requestList")}
          />
          <RequestSection
            showList={false}
            activeRequests={activeRequests}
            selectedRequest={selectedRequest}
            editingId={editingId}
            pfItems={pfItems}
            itemById={itemById}
            itemOptions={lineItemOptions}
            basePfId={basePfId}
            requestedBy={requestedBy}
            customPaName={customPaName}
            customPfName={customPfName}
            notes={notes}
            draftLines={draftLines}
            matchResult={matchResult}
            canEditDraft={canEditDraft}
            pending={pending}
            onNew={clearDraft}
            onSelectRequest={(req) => loadRequestIntoDraft(req, "requestDetail")}
            onBasePfChange={(value) => void handleBasePfChange(value)}
            onReloadDefault={() => void loadDefaultBom(basePfId)}
            onRequestedBy={setRequestedBy}
            onCustomPaName={setCustomPaName}
            onCustomPfName={setCustomPfName}
            onNotes={setNotes}
            onUpdateLine={updateDraftLine}
            onAddLine={addDraftLine}
            onRemoveLine={removeDraftLine}
            onMatch={() => void matchBom()}
            onSave={() => void saveRequest()}
            onSend={() => void sendToPrep()}
          />
        </div>
      );
    }

    if (view === "prepList") {
      return (
        <PrepListEntry
          requests={prepRequests}
          onBack={() => setView("hub")}
          onOpen={(req) => {
            setSelectedPrepId(req.request_id);
            setView("prepWork");
          }}
        />
      );
    }

    if (view === "prepWork") {
      return (
        <div className="grid gap-3">
          <ViewHeader title="준비 체크" subtitle="구성품 체크 후 준비 완료와 픽업을 처리합니다." onBack={() => setView("prepList")} />
          <PrepSection
            showList={false}
            requests={prepRequests}
            selected={selectedPrep}
            pending={pending}
            onSelect={(req) => setSelectedPrepId(req.request_id)}
            onEditRequest={(req) => loadRequestIntoDraft(req, "requestWork")}
            onChecklist={(req, itemId, checked) => void updateChecklist(req, itemId, checked)}
            onClear={(req) => void clearChecklist(req)}
            onOpenPrepare={(req) => {
              setPrepareModalFor(req);
              setCompanionDraft([{ key: lineKey(), item_id: "", quantity: 1, unit: "EA" }]);
            }}
            onCancel={(req) => void cancelPrepare(req)}
            onPickup={(req) => void completePickup(req)}
          />
        </div>
      );
    }

    if (view === "historyList") {
      return (
        <HistoryListEntry
          rows={history}
          onBack={() => setView("hub")}
          onOpen={(req) => {
            setSelectedHistoryId(req.request_id);
            setView("historyWork");
          }}
        />
      );
    }

    return (
      <div className="grid gap-3">
        <ViewHeader title="출하 상세 이력" subtitle="최종 PA/PF와 연결 입출고 로그를 확인합니다." onBack={() => setView("historyList")} />
        <HistorySection rows={history} selected={selectedHistory} onSelect={(req) => setSelectedHistoryId(req.request_id)} showList={false} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
        <div className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>출하 데이터를 불러오는 중입니다.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 min-w-0 overflow-y-auto lg:pr-4">
      <div className="flex min-h-full w-full flex-col gap-3 px-3 pb-10 pt-4 lg:px-6">
        {error && <Notice tone={LEGACY_COLORS.red} title="오류" body={error} />}
        {renderActiveView()}
      </div>

      {prepareModalFor && (
        <PrepareCompleteModal
          request={prepareModalFor}
          itemOptions={lineItemOptions}
          itemById={itemById}
          lines={companionDraft}
          pending={pending === "prepare"}
          onChange={setCompanionDraft}
          onClose={() => setPrepareModalFor(null)}
          onSubmit={() => void completePrepare()}
        />
      )}
      {confirmAction && (
        <ShippingActionConfirmModal
          action={confirmAction}
          itemById={itemById}
          pending={pending === "prepare" || pending === "cancel" || pending === "pickup"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => void executeConfirmedAction()}
        />
      )}
    </div>
  );
}

function ViewHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="이전 화면"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
          {subtitle && <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function ShippingHubEntry({ counts, onOpen }: { counts: Record<SectionTab, number>; onOpen: (section: SectionTab) => void }) {
  return (
    <div className="grid min-h-[calc(100vh-260px)] grid-rows-[auto_minmax(0,1fr)] gap-4">
      <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>작업 선택</div>
      <div className="grid min-h-0 gap-3 xl:grid-cols-3">
        <HubCard id="request" icon={ClipboardList} title="출하 요청" body="요청 목록, 상세, BOM 편집" count={counts.request} tone={LEGACY_COLORS.blue} onClick={() => onOpen("request")} />
        <HubCard id="prep" icon={ClipboardCheck} title="출하 준비 중" body="준비 체크, 준비 완료, 픽업" count={counts.prep} tone={LEGACY_COLORS.green} onClick={() => onOpen("prep")} />
        <HubCard id="history" icon={History} title="출하 이력" body="완료 요청, 재고 로그, 이벤트" count={counts.history} tone={LEGACY_COLORS.purple} onClick={() => onOpen("history")} />
      </div>
    </div>
  );
}

function HubCard({ id, icon: Icon, title, body, count, tone, onClick }: { id: SectionTab; icon: typeof PackageCheck; title: string; body: string; count: number; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-shipping-hub-card={id}
      onClick={onClick}
      className="flex h-full min-h-[360px] flex-col items-start justify-between rounded-[22px] border p-10 text-left transition-all hover:brightness-110 active:scale-[0.99]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
    >
      <div className="flex w-full items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-5">
          <Icon className="h-10 w-10 shrink-0" style={{ color: tone }} />
          <div className="min-w-0">
            <div className="text-3xl font-black leading-tight xl:text-4xl" style={{ color: LEGACY_COLORS.text }}>{title}</div>
            <div className="mt-3 text-xl font-bold leading-tight" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
          </div>
        </div>
        <span className="rounded-full px-3 py-1.5 text-sm font-black" style={{ background: tint(tone, 18), color: tone }}>{count}</span>
      </div>
      <div className="h-1.5 w-24 rounded-full" style={{ background: tone }} />
    </button>
  );
}

function RequestListEntry({ requests, onBack, onNew, onOpen }: { requests: ShippingRequest[]; onBack: () => void; onNew: () => void; onOpen: (request: ShippingRequest) => void }) {
  const groups: Array<{ status: ShippingRequestStatus; label: string }> = [
    { status: "REQUESTED", label: "요청됨" },
    { status: "PREPARING", label: "준비 중" },
    { status: "PREPARED", label: "준비 완료" },
  ];
  const total = requests.length;
  return (
    <div className="grid gap-3">
      <ViewHeader title="요청 목록" subtitle="요청됨, 준비 중, 준비 완료 상태를 나눠 확인합니다." onBack={onBack} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>출하 요청 {total}건</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>새 요청을 만들거나 기존 요청의 상태를 확인합니다.</div>
        </div>
        <PrimaryActionButton icon={Plus} label="새 요청 만들기" tone={LEGACY_COLORS.blue} onClick={onNew} dataAction="new-shipping-request" />
      </div>
      {total === 0 ? (
        <EmptyActionState title="출하 요청 없음" body="기준 PF를 선택해 새 요청을 만들 수 있습니다." actionLabel="새 요청 만들기" tone={LEGACY_COLORS.blue} onAction={onNew} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          {groups.map((group) => {
            const rows = requests.filter((request) => request.status === group.status);
            return (
              <ListColumn key={group.status} icon={ClipboardList} title={group.label} subtitle={`${rows.length}건`}>
                {rows.length === 0 ? (
                  <EmptyState title={`${group.label} 없음`} body="표시할 출하 요청이 없습니다." />
                ) : (
                  rows.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)
                )}
              </ListColumn>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestDetailEntry({ request, onBack, onEdit }: { request: ShippingRequest | null; onBack: () => void; onEdit: (request: ShippingRequest) => void }) {
  if (!request) {
    return (
      <div className="grid gap-3">
        <ViewHeader title="요청 상세" onBack={onBack} />
        <EmptyState title="선택된 요청 없음" body="목록에서 출하 요청을 선택하세요." />
      </div>
    );
  }
  const editable = request.status === "REQUESTED" || request.status === "PREPARING";
  return (
    <div className="grid gap-3">
      <ViewHeader title="요청 상세" subtitle={`${request.request_id} · ${request.base_pf_item_name}`} onBack={onBack} />
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle icon={PackageCheck} title={request.base_pf_item_name} subtitle={`요청자 ${request.requested_by_name ?? "-"} · 생성 ${formatDate(request.created_at)}`} />
          <StatusBadge status={request.status} />
        </div>
        {request.notes && <div className="mt-3"><Notice tone={LEGACY_COLORS.cyan} title="요청 메모" body={request.notes} /></div>}
        {request.status === "PREPARED" && <div className="mt-3"><Notice tone={LEGACY_COLORS.yellow} title="수정 잠김" body="준비 완료 취소 후 수정 가능합니다." /></div>}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="기준 PF" value={request.base_pf_item_name} />
          <Metric label="최종 PA" value={request.final_pa_item_name ?? "준비 전"} />
          <Metric label="최종 PF" value={request.final_pf_item_name ?? "준비 전"} />
        </div>
        <div className="mt-4"><LineSummary request={request} /></div>
        <div className="mt-4 flex justify-end gap-2">
          {editable && <ActionButton icon={Pencil} label="수정" tone={LEGACY_COLORS.blue} onClick={() => onEdit(request)} />}
        </div>
      </Panel>
    </div>
  );
}

function PrepListEntry({ requests, onBack, onOpen }: { requests: ShippingRequest[]; onBack: () => void; onOpen: (request: ShippingRequest) => void }) {
  return (
    <div className="grid gap-3">
      <ViewHeader title="준비 중 목록" subtitle="준비 중이거나 준비 완료된 요청을 선택합니다." onBack={onBack} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>준비 대상 {requests.length}건</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>체크리스트 작업과 준비 완료, 픽업 처리를 이어갑니다.</div>
        </div>
      </div>
      {requests.length === 0 ? (
        <EmptyState title="준비 중 요청 없음" body="출하 요청을 준비 중으로 보내면 여기에 표시됩니다." />
      ) : (
        <ListColumn icon={ClipboardCheck} title="준비 작업" subtitle={`${requests.length}건`}>
          {requests.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)}
        </ListColumn>
      )}
    </div>
  );
}

function HistoryListEntry({ rows, onBack, onOpen }: { rows: ShippingRequest[]; onBack: () => void; onOpen: (request: ShippingRequest) => void }) {
  return (
    <div className="grid gap-3">
      <ViewHeader title="출하 완료 목록" subtitle="픽업 완료된 출하 요청입니다." onBack={onBack} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>완료 이력 {rows.length}건</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>최종 PF, 동반 출하품, 연결 입출고 로그를 확인합니다.</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="출하 이력 없음" body="픽업 완료 처리된 요청이 아직 없습니다." />
      ) : (
        <ListColumn icon={History} title="픽업 완료" subtitle={`${rows.length}건`}>
          {rows.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)}
        </ListColumn>
      )}
    </div>
  );
}
function RequestSection(props: {
  showList?: boolean;
  activeRequests: ShippingRequest[];
  selectedRequest: ShippingRequest | null;
  editingId: string | null;
  pfItems: Item[];
  itemById: Map<string, Item>;
  itemOptions: Item[];
  basePfId: string;
  requestedBy: string;
  customPaName: string;
  customPfName: string;
  notes: string;
  draftLines: DraftLine[];
  matchResult: ShippingBomMatchResponse | null;
  canEditDraft: boolean;
  pending: PendingAction;
  onNew: () => void;
  onSelectRequest: (req: ShippingRequest) => void;
  onBasePfChange: (value: string) => void;
  onReloadDefault: () => void;
  onRequestedBy: (value: string) => void;
  onCustomPaName: (value: string) => void;
  onCustomPfName: (value: string) => void;
  onNotes: (value: string) => void;
  onUpdateLine: (key: string, patch: Partial<DraftLine>) => void;
  onAddLine: (stage: "PA" | "PF") => void;
  onRemoveLine: (key: string) => void;
  onMatch: () => void;
  onSave: () => void;
  onSend: () => void;
}) {
  const grouped = {
    PA: props.draftLines.filter((line) => line.parent_stage === "PA"),
    PF: props.draftLines.filter((line) => line.parent_stage === "PF"),
  };
  const [pfQuery, setPfQuery] = useState("");
  const filteredPfItems = useMemo(() => filterItems(props.pfItems, pfQuery), [props.pfItems, pfQuery]);
  const locked = !props.canEditDraft;
  const requiresPaName = Boolean(props.matchResult?.requires_pa_name);
  const requiresPfName = Boolean(props.matchResult?.requires_pf_name);
  const reusingExistingPa = Boolean(props.matchResult?.matched_pa_item_id);
  const reusingExistingPf = Boolean(props.matchResult?.matched_pf_item_id);
  const missingNewBomNames = Boolean(props.matchResult && ((requiresPaName && !props.customPaName.trim()) || (requiresPfName && !props.customPfName.trim())));
  const matchNoticeBody = props.matchResult
    ? [
        reusingExistingPa ? `기존 PA 재사용: ${props.matchResult.matched_pa_item_name ?? "-"}` : requiresPaName ? "새 PA 이름 필요" : null,
        reusingExistingPf ? `기존 PF 재사용: ${props.matchResult.matched_pf_item_name ?? "-"}` : requiresPfName ? "새 PF 이름 필요" : null,
      ].filter(Boolean).join(" / ")
    : "";
  const sendDisabled = props.pending !== null || locked || !props.basePfId || missingNewBomNames || props.selectedRequest?.status === "PREPARING" || props.selectedRequest?.status === "PREPARED";

  return (
    <div className="grid min-h-[620px] gap-3">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle
            icon={PackageCheck}
            title={props.editingId ? "수정 단계" : "작성 단계"}
            subtitle="기준 PF 선택부터 BOM 구성 조정까지 순서대로 처리합니다."
          />
          {props.selectedRequest && <StatusBadge status={props.selectedRequest.status} />}
        </div>

        {locked && (
          <div className="mt-3">
            <Notice tone={LEGACY_COLORS.yellow} title="수정 잠김" body="준비 완료 상태입니다. 준비 화면에서 준비 완료 취소 후 다시 수정할 수 있습니다." />
          </div>
        )}

        <div className="mt-4 grid gap-4">
          <WorkStep number={1} title="기준 PF 선택" body="출하할 최종 PF를 먼저 선택하면 기본 PF/PA 구성이 아래에 펼쳐집니다.">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Field label="PF 검색">
                <input
                  aria-label="PF 검색"
                  value={pfQuery}
                  disabled={locked || props.pending !== null}
                  onChange={(event) => setPfQuery(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  placeholder="PF 코드/품명 검색"
                />
              </Field>
              <Field label="기준 PF">
                <select
                  aria-label="기준 PF"
                  value={props.basePfId}
                  disabled={locked || props.pending !== null}
                  onChange={(event) => props.onBasePfChange(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                >
                  <option value="">PF 선택</option>
                  {filteredPfItems.map((item) => (
                    <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                  ))}
                </select>
              </Field>
            </div>
          </WorkStep>

          <WorkStep number={2} title="요청 정보" body="준비자가 확인해야 하는 담당자와 변경 사항을 남깁니다.">
            <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Field label="요청자">
                <input
                  value={props.requestedBy}
                  disabled={locked}
                  onChange={(event) => props.onRequestedBy(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  placeholder="예: 출하 담당"
                />
              </Field>
              <Field label="요청 메모">
                <textarea
                  value={props.notes}
                  disabled={locked}
                  onChange={(event) => props.onNotes(event.target.value)}
                  className="min-h-[86px] w-full min-w-0 resize-none rounded-[12px] border px-3 py-2 text-sm font-bold outline-none focus-visible:ring-2"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  placeholder="출하 준비자가 알아야 할 변경 사항"
                />
              </Field>
            </div>
          </WorkStep>

          <WorkStep number={3} title="BOM 구성 조정" body="기본 구성은 제외로 남기고, 필요한 품목은 PA/PF 묶음에 추가합니다.">
            {!props.basePfId ? (
              <EmptyState title="기준 PF를 먼저 선택하세요" body="PF를 선택하면 PA 구성품과 PF 구성품을 나눠 보여줍니다." />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                <BomEditor
                  title="PA 구성품"
                  stage="PA"
                  lines={grouped.PA}
                  itemById={props.itemById}
                  itemOptions={props.itemOptions}
                  disabled={locked}
                  onUpdate={props.onUpdateLine}
                  onAdd={props.onAddLine}
                  onRemove={props.onRemoveLine}
                />
                <BomEditor
                  title="PF 구성품"
                  stage="PF"
                  lines={grouped.PF}
                  itemById={props.itemById}
                  itemOptions={props.itemOptions}
                  disabled={locked}
                  onUpdate={props.onUpdateLine}
                  onAdd={props.onAddLine}
                  onRemove={props.onRemoveLine}
                />
              </div>
            )}
          </WorkStep>

          <WorkStep number={4} title="저장 및 전환" body="BOM 변경 결과를 확인하고 요청 저장 또는 준비 중 전환을 실행합니다.">
            <div className="grid gap-3">
              {props.matchResult && (
                <Notice
                  tone={!requiresPaName && !requiresPfName ? LEGACY_COLORS.green : LEGACY_COLORS.yellow}
                  title={!requiresPaName && !requiresPfName ? "동일 BOM 후보" : "BOM 매칭 결과"}
                  body={matchNoticeBody || "BOM 변경 후 자동으로 동일 후보를 확인합니다."}
                />
              )}

              {(requiresPaName || requiresPfName) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {requiresPaName && (
                    <Field label="새 PA 이름">
                      <input
                        aria-label="새 PA 이름"
                        value={props.customPaName}
                        disabled={locked}
                        onChange={(event) => props.onCustomPaName(event.target.value)}
                        className="h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        placeholder="새 PA 품목명"
                      />
                    </Field>
                  )}
                  {requiresPfName && (
                    <Field label="새 PF 이름">
                      <input
                        aria-label="새 PF 이름"
                        value={props.customPfName}
                        disabled={locked}
                        onChange={(event) => props.onCustomPfName(event.target.value)}
                        className="h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        placeholder="새 PF 품목명"
                      />
                    </Field>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <div className="flex flex-wrap gap-2">
                  <ActionButton icon={RefreshCw} label="기본 BOM 다시 불러오기" tone={LEGACY_COLORS.cyan} onClick={props.onReloadDefault} disabled={!props.basePfId || locked || props.pending !== null} />
                  <ActionButton icon={Search} label={props.pending === "match" ? "확인 중" : "동일 BOM 확인"} tone={LEGACY_COLORS.purple} onClick={props.onMatch} disabled={!props.basePfId || locked || props.pending !== null} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton icon={Save} label={props.pending === "save" ? "저장 중" : "요청 저장"} tone={LEGACY_COLORS.blue} onClick={props.onSave} disabled={!props.basePfId || locked || props.pending !== null} />
                  <PrimaryActionButton icon={Send} label={props.pending === "send" ? "전환 중" : "준비 중으로 보내기"} tone={LEGACY_COLORS.green} onClick={props.onSend} disabled={sendDisabled} />
                </div>
              </div>
            </div>
          </WorkStep>
        </div>
      </Panel>
    </div>
  );
}

function PrepSection({
  showList = true,
  requests,
  selected,
  pending,
  onSelect,
  onEditRequest,
  onChecklist,
  onClear,
  onOpenPrepare,
  onCancel,
  onPickup,
}: {
  showList?: boolean;
  requests: ShippingRequest[];
  selected: ShippingRequest | null;
  pending: PendingAction;
  onSelect: (req: ShippingRequest) => void;
  onEditRequest: (req: ShippingRequest) => void;
  onChecklist: (req: ShippingRequest, itemId: string, checked: boolean) => void;
  onClear: (req: ShippingRequest) => void;
  onOpenPrepare: (req: ShippingRequest) => void;
  onCancel: (req: ShippingRequest) => void;
  onPickup: (req: ShippingRequest) => void;
}) {
  const checklistGroups = useMemo(() => {
    const groups: Record<"PF" | "PA", ShippingRequest["checklist_lines"]> = { PF: [], PA: [] };
    if (!selected) return groups;
    const stageByItem = new Map(selected.bom_lines.filter((line) => line.included).map((line) => [line.child_item_id, line.parent_stage]));
    selected.checklist_lines.forEach((line) => {
      const stage = stageByItem.get(line.item_id) ?? "PA";
      groups[stage].push(line);
    });
    return groups;
  }, [selected]);

  return (
    <div className={showList ? "grid min-h-[620px] gap-3 xl:grid-cols-[360px_minmax(0,1fr)]" : "grid min-h-[620px] gap-3"}>
      {showList && (
      <Panel>
        <PanelTitle icon={ClipboardCheck} title="준비 작업" subtitle="준비할 제품을 선택해 체크리스트를 사용합니다." />
        <div className="mt-3 flex flex-col gap-2">
          {requests.length === 0 ? (
            <EmptyState title="준비 중 요청 없음" body="출하 요청을 준비 중으로 보내면 여기에 표시됩니다." />
          ) : (
            requests.map((req) => (
              <RequestRow key={req.request_id} request={req} active={selected?.request_id === req.request_id} onClick={() => onSelect(req)} />
            ))
          )}
        </div>
      </Panel>
      )}

      <Panel>
        {!selected ? (
          <EmptyState title="선택된 준비 작업 없음" body="왼쪽 목록에서 준비 작업을 선택하세요." />
        ) : (
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <PanelTitle icon={Truck} title={selected.base_pf_item_name} subtitle={`요청자 ${selected.requested_by_name ?? "-"} · ${formatDate(selected.created_at)}`} />
              <StatusBadge status={selected.status} />
            </div>

            {selected.notes && <Notice tone={LEGACY_COLORS.cyan} title="요청 메모" body={selected.notes} />}
            {selected.status === "PREPARED" && <Notice tone={LEGACY_COLORS.yellow} title="체크리스트 잠김" body="준비 완료 상태입니다. 구성품 체크를 다시 바꾸려면 먼저 준비 완료 취소를 누르세요." />}

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>구성품 체크리스트</div>
                  <ActionButton icon={RotateCcw} label="전체 해제" tone={LEGACY_COLORS.yellow} onClick={() => onClear(selected)} disabled={pending !== null || selected.status !== "PREPARING" || selected.checklist_lines.length === 0} />
                </div>
                <div className="mb-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  체크는 준비 보조용입니다. 미체크 항목이 있어도 준비 완료 처리는 가능합니다.
                </div>
                <div className="grid gap-2">
                  {selected.checklist_lines.length === 0 ? (
                    <EmptyState title="체크할 구성품 없음" body="실제 포함 구성품이 없거나 AF만 포함된 요청입니다." />
                  ) : (
                    (["PF", "PA"] as const).map((stage) => (
                      <div key={stage} className="grid gap-2 rounded-[12px] border p-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                        <div className="text-sm font-black" style={{ color: stage === "PF" ? LEGACY_COLORS.blue : LEGACY_COLORS.green }}>{stage} 구성품</div>
                        {checklistGroups[stage].length === 0 ? (
                          <div className="rounded-[10px] border px-3 py-3 text-xs font-bold" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            체크할 구성품이 없습니다.
                          </div>
                        ) : (
                          checklistGroups[stage].map((line) => (
                            <ChecklistLineRow key={line.line_id} line={line} request={selected} pending={pending} onChecklist={onChecklist} />
                          ))
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <ActionButton icon={ClipboardList} label="요청/BOM 수정" tone={LEGACY_COLORS.blue} onClick={() => onEditRequest(selected)} disabled={selected.status !== "PREPARING" || pending !== null} />
                {selected.status === "PREPARING" && (
                  <ActionButton icon={PackageCheck} label="준비 완료" tone={LEGACY_COLORS.green} onClick={() => onOpenPrepare(selected)} disabled={pending !== null} />
                )}
                {selected.status === "PREPARED" && (
                  <>
                    <ActionButton icon={RotateCcw} label={pending === "cancel" ? "취소 중" : "준비 완료 취소"} tone={LEGACY_COLORS.yellow} onClick={() => onCancel(selected)} disabled={pending !== null} />
                    <ActionButton icon={Truck} label={pending === "pickup" ? "처리 중" : "픽업 완료"} tone={LEGACY_COLORS.purple} onClick={() => onPickup(selected)} disabled={pending !== null} />
                  </>
                )}
              </div>
            </div>

            <LineSummary request={selected} />
            {selected.status === "PREPARED" && (
              <TransactionLogList title="재고 반영 내역" logs={selected.transactions.filter((log) => log.shipping_phase === "PREPARE")} />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ChecklistLineRow({
  line,
  request,
  pending,
  onChecklist,
}: {
  line: ShippingRequest["checklist_lines"][number];
  request: ShippingRequest;
  pending: PendingAction;
  onChecklist: (req: ShippingRequest, itemId: string, checked: boolean) => void;
}) {
  return (
    <label
      className="flex min-h-[54px] items-center gap-3 rounded-[12px] border px-3 py-2"
      style={{ background: LEGACY_COLORS.s1, borderColor: line.checked ? LEGACY_COLORS.green : LEGACY_COLORS.border }}
    >
      <input
        type="checkbox"
        aria-label={`${line.item_name} 체크`}
        checked={line.checked}
        disabled={pending !== null || request.status !== "PREPARING"}
        onChange={(event) => onChecklist(request, line.item_id, event.target.checked)}
        className="h-5 w-5"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</span>
        <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"} · {line.quantity}{line.quantity ? ` ${line.process_type_code ?? ""}` : ""}</span>
      </span>
      {line.checked ? <CheckCircle2 className="h-5 w-5" style={{ color: LEGACY_COLORS.green }} /> : <XCircle className="h-5 w-5" style={{ color: LEGACY_COLORS.muted2 }} />}
    </label>
  );
}
function HistorySection({ showList = true, rows, selected, onSelect }: { showList?: boolean; rows: ShippingRequest[]; selected: ShippingRequest | null; onSelect: (req: ShippingRequest) => void }) {
  return (
    <div className={showList ? "grid min-h-[620px] gap-3 xl:grid-cols-[420px_minmax(0,1fr)]" : "grid min-h-[620px] gap-3"}>
      {showList && (
      <Panel>
        <PanelTitle icon={Truck} title="출하 완료 이력" subtitle="픽업 완료된 요청만 표시합니다." />
        <div className="mt-3 flex flex-col gap-2">
          {rows.length === 0 ? (
            <EmptyState title="출하 이력 없음" body="픽업 완료 처리된 요청이 아직 없습니다." />
          ) : (
            rows.map((req) => (
              <RequestRow key={req.request_id} request={req} active={selected?.request_id === req.request_id} onClick={() => onSelect(req)} />
            ))
          )}
        </div>
      </Panel>
      )}
      <Panel>
        {!selected ? (
          <EmptyState title="선택된 이력 없음" body="왼쪽에서 완료 이력을 선택하세요." />
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <PanelTitle icon={PackageCheck} title={selected.final_pf_item_name ?? selected.base_pf_item_name} subtitle={`픽업 완료 ${formatDate(selected.picked_up_at)}`} />
              <StatusBadge status={selected.status} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="최종 PA" value={selected.final_pa_item_name ?? "-"} />
              <Metric label="최종 PF" value={selected.final_pf_item_name ?? "-"} />
              <Metric label="입출고 로그" value={`${selected.transaction_count}건`} />
            </div>
            <LineSummary request={selected} />
            <TransactionLogList logs={selected.transactions} />
            <div className="grid gap-2">
              <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>이벤트 이력</div>
              {selected.events.length === 0 ? (
                <EmptyState title="이벤트 없음" body="이 요청에 기록된 이벤트가 없습니다." />
              ) : (
                selected.events.map((event) => (
                  <div key={event.event_id} className="flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{event.message ?? event.event_type}</span>
                    <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{formatDate(event.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BomEditor({
  title,
  stage,
  lines,
  itemById,
  itemOptions,
  disabled,
  onUpdate,
  onAdd,
  onRemove,
}: {
  title: string;
  stage: "PA" | "PF";
  lines: DraftLine[];
  itemById: Map<string, Item>;
  itemOptions: Item[];
  disabled: boolean;
  onUpdate: (key: string, patch: Partial<DraftLine>) => void;
  onAdd: (stage: "PA" | "PF") => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredItemOptions = useMemo(() => filterItems(itemOptions, query), [itemOptions, query]);
  return (
    <div className="rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
        <ActionButton icon={Plus} label={`${title} 추가`} tone={stage === "PA" ? LEGACY_COLORS.green : LEGACY_COLORS.blue} onClick={() => onAdd(stage)} disabled={disabled} compact />
      </div>
      <input
        aria-label={`${title} 품목 검색`}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-2 h-9 w-full rounded-[9px] border px-2 text-sm font-bold outline-none"
        style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        placeholder="코드/품명 검색"
      />
      <div className="grid gap-2">
        {lines.length === 0 ? (
          <div className="rounded-[10px] border px-3 py-4 text-center text-sm font-bold" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
            구성품이 없습니다.
          </div>
        ) : (
          lines.map((line) => {
            const item = itemById.get(line.child_item_id);
            const isCustom = line.origin === "CUSTOM";
            const isExcluded = !line.included;
            const badgeTone = isExcluded ? LEGACY_COLORS.red : isCustom ? LEGACY_COLORS.cyan : LEGACY_COLORS.green;
            const badgeLabel = isExcluded ? "제외됨" : isCustom ? "추가됨" : "기본";
            const actionLabel = isCustom
              ? `${item?.item_name ?? "BOM 라인"} 삭제`
              : isExcluded
                ? `${item?.item_name ?? "BOM 라인"} 다시 포함`
                : `${item?.item_name ?? "BOM 라인"} 제외`;
            const ActionIcon = isCustom ? Trash2 : isExcluded ? RotateCcw : XCircle;
            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-[10px] border p-2 lg:grid-cols-[minmax(0,1fr)_90px_104px]"
                style={{ background: isExcluded ? tint(LEGACY_COLORS.red, 8) : LEGACY_COLORS.s1, borderColor: isExcluded ? tint(LEGACY_COLORS.red, 36) : LEGACY_COLORS.border }}
              >
                <div className="grid min-w-0 gap-1">
                  <select
                    value={line.child_item_id}
                    disabled={disabled || isExcluded}
                    onChange={(event) => {
                      const nextItem = itemById.get(event.target.value);
                      onUpdate(line.key, { child_item_id: event.target.value, unit: nextItem?.unit ?? "EA" });
                    }}
                    className="h-9 w-full min-w-0 rounded-[9px] border px-2 text-sm font-bold outline-none"
                    style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    <option value="">품목 선택</option>
                    {filteredItemOptions.map((option) => (
                      <option key={option.item_id} value={option.item_id}>{itemLabel(option)}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: tint(badgeTone, 18), color: badgeTone }}>{badgeLabel}</span>
                    <span className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{item?.mes_code ?? "품목 미선택"}</span>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  disabled={disabled || isExcluded}
                  onChange={(event) => onUpdate(line.key, { quantity: toNumber(event.target.value) })}
                  className="h-9 rounded-[9px] border px-2 text-right text-sm font-black outline-none"
                  style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
                <button
                  type="button"
                  aria-label={actionLabel}
                  disabled={disabled}
                  onClick={() => (isCustom ? onRemove(line.key) : onUpdate(line.key, { included: !line.included }))}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-[9px] border px-2 text-xs font-black"
                  style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: disabled ? LEGACY_COLORS.muted2 : isExcluded ? LEGACY_COLORS.green : LEGACY_COLORS.red }}
                >
                  <ActionIcon className="h-3.5 w-3.5" />
                  {isCustom ? "삭제" : isExcluded ? "포함" : "제외"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TransactionLogList({ title = "연결 입출고 로그", logs }: { title?: string; logs: ShippingRequest["transactions"] }) {
  return (
    <div className="grid gap-2">
      <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
      {logs.length === 0 ? (
        <EmptyState title="입출고 로그 없음" body="이 출하 요청에 연결된 입출고 로그가 없습니다." />
      ) : (
        <div className="grid gap-2">
          {logs.map((log) => {
            const tone = txTone(log.transaction_type, log.cancelled);
            return (
              <div
                key={log.log_id}
                className="grid gap-2 rounded-[10px] border px-3 py-2 md:grid-cols-[150px_minmax(0,1fr)_120px_150px]"
                style={{ background: LEGACY_COLORS.s1, borderColor: log.cancelled ? tint(LEGACY_COLORS.red, 40) : LEGACY_COLORS.border }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full px-2 py-1 text-xs font-black" style={{ background: tint(tone, 18), color: tone }}>{phaseLabel(log.shipping_phase)}</span>
                  <span className="rounded-full px-2 py-1 text-xs font-black" style={{ background: tint(tone, 10), color: tone }}>{txTypeLabel(log.transaction_type)}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{log.item_name}</div>
                  <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{log.mes_code ?? "-"} · {log.notes ?? "메모 없음"}</div>
                </div>
                <div className="text-sm font-black md:text-right" style={{ color: log.quantity_change < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>
                  {log.quantity_change > 0 ? "+" : ""}{log.quantity_change}
                  <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{log.quantity_before ?? "-"}{" -> "}{log.quantity_after ?? "-"}</div>
                </div>
                <div className="min-w-0 text-xs font-bold md:text-right" style={{ color: LEGACY_COLORS.muted2 }}>
                  <div className="truncate">{log.reference_no ?? "참조 없음"}</div>
                  <div>{log.cancelled ? "취소됨" : formatDate(log.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function LineSummary({ request }: { request: ShippingRequest }) {
  const paLines = request.bom_lines.filter((line) => line.parent_stage === "PA");
  const pfLines = request.bom_lines.filter((line) => line.parent_stage === "PF");
  const formatLine = (line: ShippingRequest["bom_lines"][number]) => `${line.included ? "" : "제외됨 · "}${line.origin === "CUSTOM" ? "추가됨 · " : ""}${line.item_name} x ${line.quantity}`;
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <SummaryList title="PA 구성품" lines={paLines.map(formatLine)} />
      <SummaryList title="PF 구성품" lines={pfLines.map(formatLine)} />
      <SummaryList title="카톤·동반 출하품" lines={request.companion_lines.map((line) => `${line.item_name} x ${line.quantity}`)} empty="픽업 전 입력 없음" />
    </div>
  );
}

function SummaryList({ title, lines, empty = "등록 없음" }: { title: string; lines: string[]; empty?: string }) {
  return (
    <div className="rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
      <div className="grid gap-1">
        {lines.length === 0 ? (
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{empty}</div>
        ) : (
          lines.map((line, index) => (
            <div key={`${line}-${index}`} className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line}</div>
          ))
        )}
      </div>
    </div>
  );
}

function ShippingActionConfirmModal({
  action,
  itemById,
  pending,
  onClose,
  onConfirm,
}: {
  action: ConfirmAction;
  itemById: Map<string, Item>;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = action.kind === "prepare" ? "준비 완료 확인" : action.kind === "cancel" ? "준비 완료 취소 확인" : "픽업 완료 확인";
  const tone = action.kind === "prepare" ? LEGACY_COLORS.green : action.kind === "cancel" ? LEGACY_COLORS.yellow : LEGACY_COLORS.purple;
  const description = action.kind === "prepare"
    ? "AF와 하위 자재를 차감하고 최종 PA/PF 생산 로그를 남깁니다. 준비 완료 취소로 원복할 수 있습니다."
    : action.kind === "cancel"
      ? "준비 완료 때 생성된 입출고 로그를 역재생해 재고를 원복합니다."
      : "최종 PF 1개와 카톤·동반 출하품을 출하 차감합니다. v1에서는 픽업 완료 후 취소 기능이 없습니다.";
  const lines = action.kind === "prepare"
    ? [
        ...action.request.bom_lines.filter((line) => line.included).map((line) => `${line.parent_stage} · ${line.item_name} x ${line.quantity}`),
        ...action.companionLines.map((line) => `동반 · ${itemById.get(line.item_id)?.item_name ?? "품목"} x ${line.quantity}`),
      ]
    : action.kind === "cancel"
      ? action.request.transactions.filter((log) => log.shipping_phase === "PREPARE" && !log.cancelled).map((log) => `${txTypeLabel(log.transaction_type)} · ${log.item_name} ${log.quantity_change}`)
      : [
          `최종 PF · ${action.request.final_pf_item_name ?? action.request.base_pf_item_name} x 1`,
          ...action.request.companion_lines.map((line) => `동반 · ${line.item_name} x ${line.quantity}`),
        ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "color-mix(in srgb, var(--c-bg) 72%, transparent)" }}>
      <div className="w-full max-w-xl rounded-[18px] border p-5 shadow-xl" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle icon={PackageCheck} title={title} subtitle={action.request.base_pf_item_name} />
          <StatusBadge status={action.request.status} />
        </div>
        <div className="mt-4 rounded-[12px] border px-3 py-2 text-sm font-bold" style={{ background: tint(tone, 10), borderColor: tint(tone, 35), color: LEGACY_COLORS.text }}>
          {description}
        </div>
        <div className="mt-3 grid max-h-[260px] gap-1 overflow-y-auto rounded-[12px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {lines.length === 0 ? (
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>표시할 품목 내역이 없습니다.</div>
          ) : (
            lines.map((line, index) => (
              <div key={`${line}-${index}`} className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line}</div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-[11px] border px-3 py-2 text-sm font-black disabled:opacity-45" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            닫기
          </button>
          <ActionButton icon={CheckCircle2} label={pending ? "처리 중" : "확인 후 실행"} tone={tone} onClick={onConfirm} disabled={pending} />
        </div>
      </div>
    </div>
  );
}
function PrepareCompleteModal({
  request,
  itemOptions,
  itemById,
  lines,
  pending,
  onChange,
  onClose,
  onSubmit,
}: {
  request: ShippingRequest;
  itemOptions: Item[];
  itemById: Map<string, Item>;
  lines: Array<{ key: string; item_id: string; quantity: number; unit: string }>;
  pending: boolean;
  onChange: (lines: Array<{ key: string; item_id: string; quantity: number; unit: string }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredItemOptions = useMemo(() => filterItems(itemOptions, query), [itemOptions, query]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "color-mix(in srgb, var(--c-bg) 72%, transparent)" }}>
      <div className="w-full max-w-2xl rounded-[22px] border p-5 shadow-xl" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
        <div className="flex items-start justify-between gap-3">
          <PanelTitle icon={PackageCheck} title="준비 완료 처리" subtitle={`${request.base_pf_item_name} · 카톤과 동반 출하품을 입력합니다.`} />
          <button type="button" onClick={onClose} className="rounded-[10px] border px-3 py-2 text-sm font-black" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            닫기
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          <input
            aria-label="동반 출하품 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full min-w-0 rounded-[10px] border px-3 text-sm font-bold outline-none"
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            placeholder="카톤/동반 출하품 코드·품명 검색"
          />
          {lines.map((line) => (
            <div key={line.key} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_90px_40px]">
              <select
                value={line.item_id}
                onChange={(event) => {
                  const item = itemById.get(event.target.value);
                  onChange(lines.map((row) => (row.key === line.key ? { ...row, item_id: event.target.value, unit: item?.unit ?? "EA" } : row)));
                }}
                className="h-10 w-full min-w-0 rounded-[10px] border px-3 text-sm font-bold outline-none"
                style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                <option value="">동반 출하품 선택</option>
                {filteredItemOptions.map((item) => (
                  <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(event) => onChange(lines.map((row) => (row.key === line.key ? { ...row, quantity: toNumber(event.target.value) } : row)))}
                className="h-10 rounded-[10px] border px-3 text-right text-sm font-black outline-none"
                style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
              <button
                type="button"
                aria-label="동반 출하품 삭제"
                onClick={() => onChange(lines.filter((row) => row.key !== line.key))}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <ActionButton
            icon={Plus}
            label="동반 출하품 추가"
            tone={LEGACY_COLORS.cyan}
            onClick={() => onChange([...lines, { key: lineKey(), item_id: "", quantity: 1, unit: "EA" }])}
            disabled={pending}
          />
          <ActionButton icon={CheckCircle2} label={pending ? "처리 중" : "준비 완료"} tone={LEGACY_COLORS.green} onClick={onSubmit} disabled={pending} />
        </div>
      </div>
    </div>
  );
}

function RequestRow({ request, active, onClick }: { request: ShippingRequest; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[74px] rounded-[14px] border px-3 py-2 text-left transition-colors"
      style={{
        background: active ? tint(STATUS_TONE[request.status], 16) : LEGACY_COLORS.s2,
        borderColor: active ? STATUS_TONE[request.status] : LEGACY_COLORS.border,
        color: LEGACY_COLORS.text,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{request.base_pf_item_name}</div>
          <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {request.base_pf_mes_code ?? "-"} · {request.requested_by_name ?? "요청자 없음"}
          </div>
        </div>
        <StatusBadge status={request.status} compact />
      </div>
      <div className="mt-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {request.request_id} · 생성 {formatDate(request.created_at)} {request.final_pf_item_name ? `· 최종 ${request.final_pf_item_name}` : ""}
      </div>
    </button>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      {children}
    </div>
  );
}

function PanelTitle({ icon: Icon, title, subtitle }: { icon: typeof PackageCheck; title: string; subtitle?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: tint(LEGACY_COLORS.blue, 14), color: LEGACY_COLORS.blue }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
        {subtitle && <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-black uppercase" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
      {children}
    </div>
  );
}

function Notice({ tone, title, body }: { tone: string; title: string; body: string }) {
  return (
    <div className="rounded-[12px] border px-3 py-2" style={{ background: tint(tone, 10), borderColor: tint(tone, 45) }}>
      <div className="text-sm font-black" style={{ color: tone }}>{title}</div>
      <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{body}</div>
    </div>
  );
}

function WorkStep({ number, title, body, children }: { number: number; title: string; body: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-3 flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-black" style={{ background: tint(LEGACY_COLORS.blue, 16), color: LEGACY_COLORS.blue }}>
          {number}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>{`${number}. ${title}`}</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function ListColumn({ icon: Icon, title, subtitle, children }: { icon: typeof PackageCheck; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <PanelTitle icon={Icon} title={title} subtitle={subtitle} />
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

function EmptyActionState({ title, body, actionLabel, tone, onAction }: { title: string; body: string; actionLabel: string; tone: string; onAction: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[22px] border px-6 py-10 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
      <div className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
      <div className="mt-5">
        <PrimaryActionButton icon={Plus} label={actionLabel} tone={tone} onClick={onAction} dataAction="new-shipping-request-empty" />
      </div>
    </div>
  );
}
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[14px] border px-4 py-8 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
      <div className="mt-1 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
    </div>
  );
}

function StatusBadge({ status, compact = false }: { status: ShippingRequestStatus; compact?: boolean }) {
  return (
    <span
      className={compact ? "rounded-full px-2 py-1 text-xs font-black" : "rounded-full px-3 py-1.5 text-xs font-black"}
      style={{ background: tint(STATUS_TONE[status], 20), color: STATUS_TONE[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="mt-1 truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{value}</div>
    </div>
  );
}

function PrimaryActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled = false,
  dataAction,
}: {
  icon: typeof PackageCheck;
  label: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  dataAction?: string;
}) {
  return (
    <button
      type="button"
      data-primary-action={dataAction}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-45"
      style={{ background: tint(tone, 16), borderColor: tint(tone, 48), color: tone }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled = false,
  compact = false,
}: {
  icon: typeof PackageCheck;
  label: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] border font-black transition-opacity disabled:opacity-45 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
      style={{ background: tint(tone, 12), borderColor: tint(tone, 45), color: tone }}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </button>
  );
}























