"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  History,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Item, type ShippingBomLineInput, type ShippingBomMatchResponse, type ShippingCompanionLineInput, type ShippingRequest, type ShippingRequestStatus } from "@/lib/api";
import { useShippingRequestsQuery } from "@/lib/queries/useShippingQuery";
import { queryKeys } from "@/lib/queries/keys";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { processTypeColor } from "@/lib/mes/process";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { StatusTargetNotice } from "./common/StatusTargetNotice";
import type { Operator } from "./login/useCurrentOperator";
import { QuantityStepper } from "./_warehouse_v2/QuantityStepper";

type SectionTab = "request" | "history";
type ViewMode = "hub" | "requestList" | "requestDetail" | "requestWork" | "prepList" | "prepWork" | "historyList" | "historyWork";
const VIEW_MODE_VALUES: ViewMode[] = ["hub", "requestList", "requestDetail", "requestWork", "prepList", "prepWork", "historyList", "historyWork"];
function isShippingViewMode(value: string | null): value is ViewMode {
  return Boolean(value && VIEW_MODE_VALUES.includes(value as ViewMode));
}
type RequestWizardStep = 1 | 2 | 3 | 4 | 5;
type DraftLine = ShippingBomLineInput & { key: string; included: boolean; origin: "DEFAULT" | "CUSTOM" };
type CompanionDraftLine = { key: string; item_id: string; quantity: number; unit: string };
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
  | "delete"
  | null;

type ConfirmAction =
  | { kind: "prepare"; request: ShippingRequest }
  | { kind: "cancel"; request: ShippingRequest }
  | { kind: "delete"; request: ShippingRequest }
  | { kind: "pickup"; request: ShippingRequest };

type NameValidationNotice = {
  id: number;
  message: string;
};

const EMPTY_STOCK_SHORTAGES: ShippingRequest["stock_shortages"] = [];
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

const SHIPPING_EVENT_LABEL: Record<string, string> = {
  REQUEST_CREATED: "출하 요청 생성",
  REQUEST_UPDATED: "출하 요청 수정",
  SENT_TO_PREP: "출하 준비 중 전환",
  PREPARED: "출하 준비 완료",
  PREPARE_CANCELLED: "출하 준비 취소",
  PICKED_UP: "픽업 완료 처리",
};

function txTypeLabel(type: string) {
  return TX_TYPE_LABEL[type] ?? type;
}

function phaseLabel(phase: string | null) {
  return phase ? PHASE_LABEL[phase] ?? phase : "일반";
}

function shippingEventMessage(event: ShippingRequest["events"][number]) {
  return SHIPPING_EVENT_LABEL[event.event_type] ?? event.message ?? event.event_type;
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

function toPositiveInt(value: string | number) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function isValidPositiveInt(value: string | number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
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

const SHIPPING_BOM_DEPARTMENT_ORDER: Record<string, number> = { T: 0, H: 1, V: 2, N: 3, A: 4, P: 5 };
const SHIPPING_BOM_STAGE_ORDER: Record<string, number> = { F: 0, A: 1, R: 2 };

function compareShippingBomItems(left: Item | undefined, right: Item | undefined) {
  const leftProcess = left?.process_type_code ?? "";
  const rightProcess = right?.process_type_code ?? "";
  const department = (SHIPPING_BOM_DEPARTMENT_ORDER[leftProcess[0]] ?? Object.keys(SHIPPING_BOM_DEPARTMENT_ORDER).length)
    - (SHIPPING_BOM_DEPARTMENT_ORDER[rightProcess[0]] ?? Object.keys(SHIPPING_BOM_DEPARTMENT_ORDER).length);
  if (department !== 0) return department;

  const stage = (SHIPPING_BOM_STAGE_ORDER[leftProcess[1]] ?? Object.keys(SHIPPING_BOM_STAGE_ORDER).length)
    - (SHIPPING_BOM_STAGE_ORDER[rightProcess[1]] ?? Object.keys(SHIPPING_BOM_STAGE_ORDER).length);
  if (stage !== 0) return stage;

  const leftSerial = left?.serial_no;
  const rightSerial = right?.serial_no;
  if (leftSerial === null || leftSerial === undefined) {
    if (rightSerial !== null && rightSerial !== undefined) return 1;
  } else if (rightSerial === null || rightSerial === undefined) {
    return -1;
  } else if (leftSerial !== rightSerial) {
    return leftSerial - rightSerial;
  }

  const leftCode = left?.mes_code;
  const rightCode = right?.mes_code;
  if (!leftCode && rightCode) return 1;
  if (leftCode && !rightCode) return -1;
  if (leftCode && rightCode) {
    const code = leftCode.localeCompare(rightCode);
    if (code !== 0) return code;
  }
  return (left?.item_id ?? "").localeCompare(right?.item_id ?? "");
}

function sortShippingDraftLines(lines: DraftLine[], itemById: Map<string, Item>) {
  return [...lines].sort((left, right) => {
    const itemOrder = compareShippingBomItems(itemById.get(left.child_item_id), itemById.get(right.child_item_id));
    if (itemOrder !== 0) return itemOrder;
    return left.key.localeCompare(right.key);
  });
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

function requestCompanionDraft(req: ShippingRequest): CompanionDraftLine[] {
  return req.companion_lines.map((line) => ({
    key: line.line_id ?? `companion-${line.item_id}`,
    item_id: line.item_id,
    quantity: line.quantity,
    unit: line.unit,
  }));
}

function companionPayload(lines: CompanionDraftLine[], itemById: Map<string, Item>): ShippingCompanionLineInput[] {
  return lines
    .filter((line) => line.item_id && Number(line.quantity) > 0)
    .map((line) => ({
      item_id: line.item_id,
      quantity: toPositiveInt(line.quantity),
      unit: line.unit || itemById.get(line.item_id)?.unit || "EA",
    }));
}

export function DesktopShippingView({ onStatusChange, operator = null }: { onStatusChange: (status: string) => void; operator?: Operator | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlSearchRef = useRef(searchParams.toString());
  const pendingUrlSearchRef = useRef<string | null>(null);
  const [view, setView] = useState<ViewMode>("hub");
  const [items, setItems] = useState<Item[]>([]);
  const [pfItems, setPfItems] = useState<Item[]>([]);
  const queryClient = useQueryClient();
  const shippingRequestsQuery = useShippingRequestsQuery();
  const requests = useMemo(() => shippingRequestsQuery.data ?? [], [shippingRequestsQuery.data]);
  const setRequests = useCallback(
    (next: ShippingRequest[] | ((prev: ShippingRequest[]) => ShippingRequest[])) => {
      queryClient.setQueryData<ShippingRequest[]>(queryKeys.shipping.requests(), (prev) =>
        typeof next === "function" ? (next as (prev: ShippingRequest[]) => ShippingRequest[])(prev ?? []) : next,
      );
    },
    [queryClient],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const setError = setMutationError;
  const error = mutationError ?? (shippingRequestsQuery.error
    ? shippingRequestsQuery.error instanceof Error
      ? shippingRequestsQuery.error.message
      : "출하 데이터를 불러오지 못했습니다."
    : null);
  const loading = shippingRequestsQuery.isLoading;
  const [itemsLoading, setItemsLoading] = useState(false);
  const [pfItemsLoading, setPfItemsLoading] = useState(false);
  const [pfItemsLoaded, setPfItemsLoaded] = useState(false);
  const [pfItemsError, setPfItemsError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [requestWizardStep, setRequestWizardStep] = useState<RequestWizardStep>(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [basePfId, setBasePfId] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [requestQuantity, setRequestQuantity] = useState<number | "">(1);
  const [customPaName, setCustomPaName] = useState("");
  const [customPfName, setCustomPfName] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [matchResult, setMatchResult] = useState<ShippingBomMatchResponse | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [companionDraft, setCompanionDraft] = useState<CompanionDraftLine[]>([]);
  const [nameValidationNotice, setNameValidationNotice] = useState<NameValidationNotice | null>(null);
  const nameValidationNoticeIdRef = useRef(0);

  const showNameValidationNotice = useCallback((message: string) => {
    nameValidationNoticeIdRef.current += 1;
    setNameValidationNotice({
      id: nameValidationNoticeIdRef.current,
      message,
    });
  }, []);

  const displayItems = useMemo(() => {
    const byId = new Map<string, Item>();
    items.forEach((item) => byId.set(item.item_id, item));
    pfItems.forEach((item) => {
      if (!byId.has(item.item_id)) byId.set(item.item_id, item);
    });
    return Array.from(byId.values());
  }, [items, pfItems]);
  const itemById = useMemo(() => new Map(displayItems.map((item) => [item.item_id, item])), [displayItems]);
  const lineItemOptions = useMemo(() => items.filter((item) => !item.deleted_at), [items]);
  const activeRequests = useMemo(() => requests.filter((req) => req.status !== "PICKED_UP"), [requests]);
  const prepRequests = useMemo(
    () => requests.filter((req) => req.status === "PREPARING" || req.status === "PREPARED"),
    [requests],
  );
  const history = useMemo(() => requests.filter((req) => req.status === "PICKED_UP"), [requests]);
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
  const shippingWorkDirty = view === "requestWork" || view === "prepWork" || view === "historyWork";
  const saveShippingWork = useCallback(() => {}, []);
  useRegisterDirty("shipping-work", shippingWorkDirty, saveShippingWork, undefined, { mode: "confirm-only" });
  function buildShippingUrl(nextView: ViewMode, requestId?: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "shipping");
    if (nextView === "hub") {
      params.delete("shippingView");
      params.delete("shippingRequestId");
    } else {
      params.set("shippingView", nextView);
      if (requestId) params.set("shippingRequestId", requestId);
      else params.delete("shippingRequestId");
    }
    return `?${params.toString()}`;
  }

  function navigateView(nextView: ViewMode, requestId?: string | null) {
    const url = buildShippingUrl(nextView, requestId);
    pendingUrlSearchRef.current = url.startsWith("?") ? url.slice(1) : url;
    setView(nextView);
    router.push(url, { scroll: false });
  }

  const upsertRequest = useCallback((next: ShippingRequest) => {
    setRequests((prev) => {
      const rest = prev.filter((row) => row.request_id !== next.request_id);
      return [next, ...rest];
    });
  }, [setRequests]);

  const ensureItemsLoaded = useCallback(async (): Promise<Item[] | null> => {
    if (items.length > 0) return items;
    if (itemsLoading) return items.length > 0 ? items : null;
    setItemsLoading(true);
    setPending("load");
    setError(null);
    try {
      const nextItems = await api.getItems({ limit: 2000 });
      setItems(nextItems);
      return nextItems;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "품목 목록을 불러오지 못했습니다.";
      setError(msg);
      onStatusChange(msg);
      return null;
    } finally {
      setItemsLoading(false);
      setPending(null);
    }
  }, [items, itemsLoading, onStatusChange, setError]);

  const ensurePfItemsLoaded = useCallback(async () => {
    if (pfItemsLoaded || pfItems.length > 0) return true;
    if (pfItemsLoading) return true;
    setPfItemsLoading(true);
    setPfItemsError(null);
    try {
      const nextItems = await api.getItems({ process_type_code: "PF", limit: 2000 });
      setPfItems(nextItems.filter((item) => item.process_type_code === "PF" && !item.deleted_at));
      setPfItemsLoaded(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PF 후보를 불러오지 못했습니다.";
      setPfItemsError(msg);
      onStatusChange(msg);
      return false;
    } finally {
      setPfItemsLoading(false);
    }
  }, [pfItems.length, pfItemsLoaded, pfItemsLoading, onStatusChange]);

  // 초기 요청 로드 중 목록 flicker 방지: 실제 목록은 useShippingRequestsQuery가 관리한다.
  // 이 effect는 첫 데이터가 들어온 뒤 선택 id 기본값만 맞춘다.
  useEffect(() => {
    if (shippingRequestsQuery.isLoading) return;
    const data = shippingRequestsQuery.data ?? [];
    setSelectedPrepId((current) => current ?? data.find((req) => req.status === "PREPARING" || req.status === "PREPARED")?.request_id ?? null);
    setSelectedHistoryId((current) => current ?? data.find((req) => req.status === "PICKED_UP")?.request_id ?? null);
    if (shippingRequestsQuery.error) {
      const msg = shippingRequestsQuery.error instanceof Error ? shippingRequestsQuery.error.message : "출하 데이터를 불러오지 못했습니다.";
      onStatusChange(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingRequestsQuery.data, shippingRequestsQuery.isLoading, shippingRequestsQuery.error]);
  useEffect(() => {
    if (searchParams.get("tab") !== "shipping") return;
    const currentSearch = searchParams.toString();
    if (pendingUrlSearchRef.current) {
      if (currentSearch === pendingUrlSearchRef.current) {
        pendingUrlSearchRef.current = null;
      } else {
        return;
      }
    }
    const hasSubview = searchParams.has("shippingView");
    if (!hasSubview && lastUrlSearchRef.current === currentSearch && view !== "hub") return;
    lastUrlSearchRef.current = currentSearch;
    const nextView = isShippingViewMode(searchParams.get("shippingView")) ? searchParams.get("shippingView") as ViewMode : "hub";
    const requestId = searchParams.get("shippingRequestId");

    if (nextView === "hub") {
      setView("hub");
      return;
    }
    if (nextView === "requestList" || nextView === "prepList" || nextView === "historyList") {
      setView(nextView);
      return;
    }
    if (nextView === "requestDetail") {
      if (!requestId) {
        setView("requestList");
        return;
      }
      setEditingId(requestId);
      setView("requestDetail");
      return;
    }
    if (nextView === "prepWork") {
      if (!requestId) {
        setView("prepList");
        return;
      }
      setSelectedPrepId(requestId);
      setView("prepWork");
      return;
    }
    if (nextView === "historyWork") {
      if (!requestId) {
        setView("historyList");
        return;
      }
      setSelectedHistoryId(requestId);
      setView("historyWork");
      return;
    }
    if (requestId) {
      const found = requests.find((req) => req.request_id === requestId);
      if (found) {
        setEditingId(found.request_id);
        setBasePfId(found.base_pf_item_id);
        setRequestedBy(found.requested_by_name ?? "");
        setCustomPaName(found.custom_pa_name ?? "");
        setCustomPfName(found.custom_pf_name ?? "");
        setNotes(found.notes ?? "");
        setRequestQuantity(found.request_quantity ?? 1);
        setCompanionDraft(requestCompanionDraft(found));
        setDraftLines(requestBomLines(found));
        setMatchResult(null);
        setRequestWizardStep(2);
        setView("requestWork");
        void ensureItemsLoaded();
        void ensurePfItemsLoaded();
      } else if (!loading) setView("requestList");
      return;
    }
    setEditingId(null);
    setRequestWizardStep(1);
    setRequestQuantity(1);
    setCompanionDraft([]);
    setView("requestWork");
    void ensurePfItemsLoaded();
  // URL query drives browser back/forward for the shipping subview.
  }, [searchParams, requests, loading, view, ensurePfItemsLoaded, ensureItemsLoaded]);

  function clearDraft() {
    navigateView("requestWork");
    setRequestWizardStep(1);
    setEditingId(null);
    setBasePfId("");
    setRequestedBy(operator?.name ?? "");
    setRequestQuantity(1);
    setCompanionDraft([]);
    setCustomPaName("");
    setCustomPfName("");
    setNotes("");
    setDraftLines([]);
    setMatchResult(null);
    void ensurePfItemsLoaded();
  }

  function loadRequestIntoDraft(req: ShippingRequest, nextView: ViewMode = "requestWork", syncUrl = true) {
    setEditingId(req.request_id);
    setBasePfId(req.base_pf_item_id);
    setRequestedBy(req.requested_by_name ?? "");
    setCustomPaName(req.custom_pa_name ?? "");
    setCustomPfName(req.custom_pf_name ?? "");
    setNotes(req.notes ?? "");
    setRequestQuantity(req.request_quantity ?? 1);
    setCompanionDraft(requestCompanionDraft(req));
    setDraftLines(requestBomLines(req));
    setMatchResult(null);
    setRequestWizardStep(nextView === "requestWork" ? 2 : 1);
    if (syncUrl) navigateView(nextView, req.request_id);
    else setView(nextView);
    if (nextView === "requestWork") void ensureItemsLoaded();
  }

  async function loadDefaultBom(nextBasePfId: string, sourceItems: Item[] = items) {
    if (!nextBasePfId) {
      setDraftLines([]);
      return;
    }
    setPending("load");
    setError(null);
    try {
      const sourceItemById = new Map(sourceItems.map((item) => [item.item_id, item]));
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
        .map((row) => sourceItemById.get(row.child_item_id))
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
    setRequestWizardStep(1);
    const loadedItems = await ensureItemsLoaded();
    if (!loadedItems) return;
    await loadDefaultBom(nextBasePfId, loadedItems);
  }

  function draftPayload() {
    return {
      request_quantity: toPositiveInt(requestQuantity),
      requested_by_name: (editingId ? requestedBy.trim() : operator?.name?.trim() || requestedBy.trim()) || null,
      custom_pa_name: customPaName.trim() || null,
      custom_pf_name: customPfName.trim() || null,
      notes: notes.trim() || null,
      companion_lines: companionPayload(companionDraft, itemById),
      bom_lines: sortShippingDraftLines(draftLines, itemById)
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
    if (!isValidPositiveInt(requestQuantity)) {
      onStatusChange("출하 수량은 1 이상의 정수여야 합니다.");
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
      if (saved.status === "PREPARING") {
        navigateView("requestList");
      }
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
    if (!isValidPositiveInt(requestQuantity)) {
      onStatusChange("출하 수량은 1 이상의 정수여야 합니다.");
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
      navigateView("prepWork", next.request_id);
      onStatusChange("출하 요청을 준비 중으로 넘겼습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "준비 중 전환에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }

  async function sendExistingToPrep(req: ShippingRequest) {
    if (req.status !== "REQUESTED") {
      onStatusChange("요청 상태에서만 준비 중으로 보낼 수 있습니다.");
      return;
    }
    setPending("send");
    setError(null);
    try {
      const next = await api.sendShippingToPrep(req.request_id);
      upsertRequest(next);
      setSelectedPrepId(next.request_id);
      navigateView("prepWork", next.request_id);
      onStatusChange("출하 요청을 준비 중으로 넘겼습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "준비 중 전환에 실패했습니다.";
      setError(msg);
      onStatusChange(msg);
    } finally {
      setPending(null);
    }
  }

  function deleteRequest(req: ShippingRequest) {
    setConfirmAction({ kind: "delete", request: req });
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

  function completePrepare(req: ShippingRequest) {
    setConfirmAction({ kind: "prepare", request: req });
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
    setPending(action.kind === "prepare" ? "prepare" : action.kind === "cancel" ? "cancel" : action.kind === "delete" ? "delete" : "pickup");
    setError(null);
    try {
      if (action.kind === "prepare") {
        const next = await api.prepareShippingComplete(action.request.request_id);
        upsertRequest(next);
        setSelectedPrepId(next.request_id);
        onStatusChange("출하 준비 완료 처리했습니다.");
      } else if (action.kind === "cancel") {
        const next = await api.cancelShippingPrepare(action.request.request_id, { reason: "출하 준비 변경" });
        upsertRequest(next);
        setSelectedPrepId(next.request_id);
        onStatusChange("준비 완료를 취소했습니다. 요청과 BOM을 다시 수정할 수 있습니다.");
      } else if (action.kind === "delete") {
        await api.deleteShippingRequest(action.request.request_id);
        setRequests((prev) => prev.filter((row) => row.request_id !== action.request.request_id));
        setEditingId(null);
        navigateView("requestList");
        onStatusChange("출하 요청을 취소했습니다.");
      } else {
        const next = await api.completeShippingPickup(action.request.request_id);
        upsertRequest(next);
        setSelectedHistoryId(next.request_id);
        navigateView("historyWork", next.request_id);
        onStatusChange("픽업 완료 처리했습니다.");
      }
      setConfirmAction(null);
    } catch (err) {
      const fallback = action.kind === "prepare" ? "준비 완료 처리에 실패했습니다." : action.kind === "cancel" ? "준비 완료 취소에 실패했습니다." : action.kind === "delete" ? "요청 취소에 실패했습니다." : "픽업 완료 처리에 실패했습니다.";
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

  function addDraftLine(stage: "PA" | "PF", itemId: string) {
    const item = itemById.get(itemId);
    setDraftLines((prev) => {
      const existing = prev.find((line) => line.parent_stage === stage && line.child_item_id === itemId);
      if (existing) {
        return prev.map((line) => line.key === existing.key
          ? { ...line, included: true, quantity: toNumber(line.quantity) + 1, unit: item?.unit ?? line.unit ?? "EA" }
          : line);
      }
      return [...prev, { key: lineKey(), parent_stage: stage, child_item_id: itemId, quantity: 1, unit: item?.unit ?? "EA", included: true, origin: "CUSTOM" }];
    });
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

  useEffect(() => {
    if (!matchResult) return;

    const basePfName = itemById.get(basePfId)?.item_name?.trim();
    const basePaLine = draftLines.find((line) => (
      line.parent_stage === "PF"
      && itemById.get(line.child_item_id)?.process_type_code === "PA"
    ));
    const basePaName = basePaLine ? itemById.get(basePaLine.child_item_id)?.item_name?.trim() : undefined;

    if (matchResult.requires_pa_name && basePaName) {
      setCustomPaName((current) => current.trim() || basePaName);
    }
    if (matchResult.requires_pf_name && basePfName) {
      setCustomPfName((current) => current.trim() || basePfName);
    }
  }, [basePfId, draftLines, itemById, matchResult]);

  function openSection(next: SectionTab) {
    navigateView(next === "request" ? "requestList" : "historyList");
  }

  function renderActiveView() {
    const counts = {
      request: activeRequests.length,
      history: history.length,
    };

    if (view === "hub") {
      return <ShippingHubEntry counts={counts} onOpen={openSection} />;
    }

    if (view === "requestList") {
      return (
        <RequestListEntry
          requests={activeRequests}
          onBack={() => navigateView("hub")}
          onNew={clearDraft}
          onOpen={(req) => loadRequestIntoDraft(req, "requestDetail")}
        />
      );
    }

    if (view === "requestDetail") {
      return (
        <RequestDetailEntry
          request={selectedRequest}
          onBack={() => navigateView("requestList")}
          onEdit={(req) => loadRequestIntoDraft(req, "requestWork")}
          onSendToPrep={(req) => void sendExistingToPrep(req)}
          onDelete={deleteRequest}
          onPrepareCancel={cancelPrepare}
          onPickup={completePickup}
          pending={pending}
        />
      );
    }

    if (view === "requestWork") {
      return (
        <RequestSection
            showList={false}
            onBack={() => navigateView(selectedRequest ? "requestDetail" : "requestList", selectedRequest?.request_id)}
            activeRequests={activeRequests}
            selectedRequest={selectedRequest}
            editingId={editingId}
            pfItems={pfItems}
            pfItemsLoading={pfItemsLoading}
            pfItemsError={pfItemsError}
            itemById={itemById}
            itemOptions={lineItemOptions}
            basePfId={basePfId}
            requestedBy={editingId ? requestedBy : operator?.name ?? requestedBy}
            requestQuantity={requestQuantity}
            companionDraft={companionDraft}
            customPaName={customPaName}
            customPfName={customPfName}
            notes={notes}
            draftLines={draftLines}
            matchResult={matchResult}
            canEditDraft={canEditDraft}
            pending={pending}
            wizardStep={requestWizardStep}
            onWizardStep={setRequestWizardStep}
            onNew={clearDraft}
            onSelectRequest={(req) => loadRequestIntoDraft(req, "requestDetail")}
            onBasePfChange={(value) => void handleBasePfChange(value)}
            onRequestedBy={setRequestedBy}
            onRequestQuantity={setRequestQuantity}
            onCustomPaName={setCustomPaName}
            onCustomPfName={setCustomPfName}
            onStatusChange={onStatusChange}
            onNameValidationNotice={showNameValidationNotice}
            onNotes={setNotes}
            onUpdateLine={updateDraftLine}
            onAddLine={addDraftLine}
            onRemoveLine={removeDraftLine}
            onAddCompanion={(itemId) => {
              const item = itemById.get(itemId);
              if (!item) return;
              setCompanionDraft((prev) => {
                const existing = prev.find((line) => line.item_id === itemId);
                if (existing) {
                  return prev.map((line) => line.item_id === itemId ? { ...line, quantity: toPositiveInt(line.quantity) + 1 } : line);
                }
                return [...prev, { key: lineKey(), item_id: itemId, quantity: 1, unit: item.unit || "EA" }];
              });
            }}
            onUpdateCompanion={(key, patch) => setCompanionDraft((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line))}
            onRemoveCompanion={(key) => setCompanionDraft((prev) => prev.filter((line) => line.key !== key))}
            onSave={() => void saveRequest()}
            onSend={() => void sendToPrep()}
          />
      );
    }

    if (view === "prepList") {
      return (
        <PrepListEntry
          requests={prepRequests}
          onBack={() => navigateView("hub")}
          onOpen={(req) => {
            setSelectedPrepId(req.request_id);
            navigateView("prepWork", req.request_id);
          }}
        />
      );
    }

    if (view === "prepWork") {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ViewHeader title="준비 체크" subtitle="구성품 체크 후 준비 완료와 픽업을 처리합니다." onBack={() => navigateView("requestList")} />
          <PrepSection
            showList={false}
            requests={prepRequests}
            selected={selectedPrep}
            pending={pending}
            onSelect={(req) => setSelectedPrepId(req.request_id)}
            onOpenPrepare={(req) => void completePrepare(req)}
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
          onBack={() => navigateView("hub")}
          onOpen={(req) => {
            setSelectedHistoryId(req.request_id);
            navigateView("historyWork", req.request_id);
          }}
        />
      );
    }

    return (
      <div className="grid gap-3">
        <ViewHeader title="출하 상세 이력" subtitle="최종 PA/PF와 연결 입출고 로그를 확인합니다." onBack={() => navigateView("historyList")} />
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
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      <div
        data-testid="shipping-root-panel"
        className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-[28px] border px-4 py-4"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "0 18px 50px rgba(148, 163, 184, 0.18)",
        }}
      >
        {error && <Notice tone={LEGACY_COLORS.red} title="오류" body={error} />}
        {renderActiveView()}
      </div>

      {confirmAction && (
        <ShippingActionConfirmModal
          action={confirmAction}
          pending={pending === "prepare" || pending === "cancel" || pending === "pickup" || pending === "delete"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => void executeConfirmedAction()}
        />
      )}

      {nameValidationNotice && (
        <StatusTargetNotice
          key={nameValidationNotice.id}
          notice={nameValidationNotice}
          icon={Pencil}
          dataTestId="shipping-name-validation-notice"
          style={{
            background: "var(--c-popup-bg)",
            borderColor: tint(LEGACY_COLORS.blue, 45),
            color: LEGACY_COLORS.blue,
            boxShadow: "var(--c-popup-shadow)",
          }}
          onArrive={(noticeId) => {
            if (nameValidationNoticeIdRef.current !== noticeId) return;
            onStatusChange(nameValidationNotice.message);
            setNameValidationNotice((current) => current?.id === noticeId ? null : current);
          }}
        />
      )}
    </div>
  );
}

function ViewHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      <div className={SHIPPING_ROW_CLASS}>
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
    <div className="grid h-full min-h-0 flex-1 gap-3 xl:grid-cols-2">
      <HubCard id="request" icon={ClipboardList} title="출하 관리" detail="요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다." count={counts.request} tone={LEGACY_COLORS.blue} onClick={() => onOpen("request")} />
      <HubCard id="history" icon={History} title="출하 이력" detail="픽업 완료된 출하와 연결 입출고 로그를 확인합니다." count={counts.history} tone={LEGACY_COLORS.purple} onClick={() => onOpen("history")} />
    </div>
  );
}

function HubCard({ id, icon: Icon, title, detail, count, tone, onClick }: { id: SectionTab; icon: typeof PackageCheck; title: string; detail: string; count?: number; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-shipping-hub-card={id}
      onClick={onClick}
      className="flex h-full min-h-[360px] min-w-0 flex-col items-start justify-between rounded-[22px] border p-7 text-left transition-all hover:brightness-110 active:scale-[0.99] xl:p-8"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Icon className="h-8 w-8 shrink-0" style={{ color: tone }} />
          <div className="min-w-0">
            <div className="text-3xl font-black leading-tight xl:text-4xl" style={{ color: LEGACY_COLORS.text }}>{title}</div>
          </div>
        </div>
        {count !== undefined && <span data-testid={"shipping-hub-count-" + id} className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full px-4 text-lg font-black" style={{ background: tint(tone, 18), color: tone }}>{count}</span>}
      </div>
      <div className="mt-auto text-sm font-black leading-tight xl:text-base" style={{ color: LEGACY_COLORS.muted2 }}>{detail}</div>
    </button>
  );
}

function RequestListEntry({ requests, onBack, onNew, onOpen }: { requests: ShippingRequest[]; onBack: () => void; onNew: () => void; onOpen: (request: ShippingRequest) => void }) {
  const groups: Array<{ status: ShippingRequestStatus; label: string }> = [
    { status: "REQUESTED", label: "출하 요청" },
    { status: "PREPARING", label: "준비 중" },
    { status: "PREPARED", label: "준비 완료" },
  ];
  const total = requests.length;
  return (
    <div data-testid="shipping-request-list-panel" className={`${SHIPPING_FLEX_COL_CLASS} gap-3`}>
      <div className={SHIPPING_ROW_CLASS}>
        <button type="button" aria-label="작업 선택으로 돌아가기" onClick={onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-xl font-black" style={{ color: LEGACY_COLORS.text }}>출하 관리</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>진행 중 출하 {total}건 · 요청 생성, 준비 체크, 픽업 완료까지 이어서 처리합니다.</div>
        </div>
      </div>

      <div data-testid="shipping-request-list-grid" className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        {groups.map((group) => {
          const rows = requests.filter((request) => request.status === group.status);
          return (
            <ListColumn
              key={group.status}
              icon={ClipboardList}
              title={group.label}
              subtitle={`${rows.length}건`}
              bodyDataTestId={`shipping-request-column-body-${group.status}`}
              action={group.status === "REQUESTED" ? <PrimaryActionButton icon={Plus} label="새 요청 만들기" tone={LEGACY_COLORS.blue} onClick={onNew} dataAction="new-shipping-request" /> : null}
            >
              {rows.length === 0 ? (
                <EmptyState title={`${group.label} 없음`} body="표시할 출하 요청이 없습니다." />
              ) : (
                rows.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)
              )}
            </ListColumn>
          );
        })}
      </div>
    </div>
  );
}


function RequestDetailEntry({ request, onBack, onEdit, onSendToPrep, onDelete, onPrepareCancel, onPickup, pending }: { request: ShippingRequest | null; onBack: () => void; onEdit: (request: ShippingRequest) => void; onSendToPrep: (request: ShippingRequest) => void; onDelete: (request: ShippingRequest) => void; onPrepareCancel: (request: ShippingRequest) => void; onPickup: (request: ShippingRequest) => void; pending: PendingAction }) {
  if (!request) {
    return (
      <div className={SHIPPING_FLEX_COL_CLASS}>
        <Panel className={SHIPPING_FLEX_COL_CLASS}>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="요청 목록으로 돌아가기" onClick={onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <PanelTitle icon={PackageCheck} title="요청 상세" subtitle="목록에서 출하 요청을 선택하세요." />
          </div>
          <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
            <EmptyState title="선택된 요청 없음" body="목록에서 출하 요청을 선택하세요." />
          </div>
        </Panel>
      </div>
    );
  }
  const editable = request.status === "REQUESTED" || request.status === "PREPARING";
  const canSend = request.status === "REQUESTED";
  const canDelete = request.status === "REQUESTED" || request.status === "PREPARING";
  const canCancelPrepared = request.status === "PREPARED";
  const finalPfName = request.final_pf_item_name ?? request.base_pf_item_name;
  const titleSubtitle = [
    "요청 상세",
    request.final_pf_item_name && request.final_pf_item_name !== request.base_pf_item_name ? `기준 ${request.base_pf_item_name}` : null,
    `생성 ${formatDate(request.created_at)}`,
  ].filter(Boolean).join(" · ");
  return (
    <div className={SHIPPING_FLEX_COL_CLASS}>
      <Panel dataTestId="shipping-request-detail" className={SHIPPING_FLEX_COL_CLASS}>
        <div data-testid="shipping-request-detail-header" className={SHIPPING_TOP_ROW_CLASS}>
          <div className={SHIPPING_ROW_CLASS}>
            <button type="button" aria-label="요청 목록으로 돌아가기" onClick={onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <PanelTitle icon={PackageCheck} title={finalPfName} subtitle={titleSubtitle} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canCancelPrepared && (
              <div
                data-testid="shipping-detail-edit-lock"
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black"
                style={{
                  background: tint(LEGACY_COLORS.yellow, 10),
                  borderColor: tint(LEGACY_COLORS.yellow, 35),
                  color: LEGACY_COLORS.text,
                }}
              >
                <LockKeyhole className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
                <span>수정 잠김</span>
                <span className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>준비 완료 취소 후 수정 가능</span>
              </div>
            )}
            <StatusBadge status={request.status} />
          </div>
        </div>

        {request.notes && <div className="mt-3"><Notice tone={LEGACY_COLORS.cyan} title="요청 메모" body={request.notes} /></div>}

        <div className="mt-3 min-h-0 flex-1"><LineSummary request={request} /></div>

        <div data-testid="shipping-detail-actions" className="mt-3 flex flex-wrap justify-end gap-2 rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {canSend && <ActionButton icon={Send} label={pending === "send" ? "요청 중" : "출하 요청"} tone={LEGACY_COLORS.green} onClick={() => onSendToPrep(request)} disabled={pending !== null} dataTestId="shipping-detail-send-to-prep" />}
          {editable && <ActionButton icon={Pencil} label="수정" tone={LEGACY_COLORS.blue} onClick={() => onEdit(request)} disabled={pending !== null} dataTestId="shipping-edit-request" />}
          {canDelete && <ActionButton icon={Trash2} label={pending === "delete" ? "취소 중" : "요청 취소"} tone={LEGACY_COLORS.red} onClick={() => onDelete(request)} disabled={pending !== null} dataTestId="shipping-delete-request" />}
          {canCancelPrepared && <ActionButton icon={Truck} label={pending === "pickup" ? "처리 중" : "픽업 완료"} tone={LEGACY_COLORS.purple} onClick={() => onPickup(request)} disabled={pending !== null} dataTestId="shipping-pickup-from-detail" />}
          {canCancelPrepared && <ActionButton icon={RotateCcw} label={pending === "cancel" ? "취소 중" : "준비 완료 취소"} tone={LEGACY_COLORS.yellow} onClick={() => onPrepareCancel(request)} disabled={pending !== null} dataTestId="shipping-prepare-cancel-from-detail" />}
        </div>
      </Panel>
    </div>
  );
}


function PrepListEntry({ requests, onBack, onOpen }: { requests: ShippingRequest[]; onBack: () => void; onOpen: (request: ShippingRequest) => void }) {
  return (
    <div className={SHIPPING_FLEX_COL_CLASS}>
      <Panel dataTestId="shipping-prep-list" className={SHIPPING_FLEX_COL_CLASS}>
        <div className={SHIPPING_ROW_CLASS}>
          <button type="button" aria-label="작업 선택으로 돌아가기" onClick={onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <PanelTitle icon={ClipboardCheck} title="준비 중 목록" subtitle={`준비 대상 ${requests.length}건 · 체크리스트 작업과 준비 완료, 픽업 처리를 이어갑니다.`} />
        </div>
        <div className={SHIPPING_MODAL_BODY_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {requests.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="준비 중 요청 없음" body="출하 요청을 준비 중으로 보내면 여기에 표시됩니다." />
            </div>
          ) : (
            <div className="grid flex-1 content-start gap-2 overflow-y-auto pr-1">
              {requests.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}


function HistoryListEntry({ rows, onBack, onOpen }: { rows: ShippingRequest[]; onBack: () => void; onOpen: (request: ShippingRequest) => void }) {
  return (
    <div className={SHIPPING_FLEX_COL_CLASS}>
      <Panel dataTestId="shipping-history-list" className={SHIPPING_FLEX_COL_CLASS}>
        <div className={SHIPPING_ROW_CLASS}>
          <button type="button" aria-label="작업 선택으로 돌아가기" onClick={onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <PanelTitle icon={History} title="출하 완료 목록" subtitle={`완료 이력 ${rows.length}건 · 최종 PF, 동반 출하품, 연결 입출고 로그를 확인합니다.`} />
        </div>
        <div className={SHIPPING_MODAL_BODY_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="출하 이력 없음" body="픽업 완료 처리된 요청이 아직 없습니다." />
            </div>
          ) : (
            <div className="grid flex-1 content-start gap-2 overflow-y-auto pr-1">
              {rows.map((request) => <RequestRow key={request.request_id} request={request} active={false} onClick={() => onOpen(request)} />)}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}


function RequestSection(props: {
  showList?: boolean;
  activeRequests: ShippingRequest[];
  selectedRequest: ShippingRequest | null;
  editingId: string | null;
  pfItems: Item[];
  pfItemsLoading: boolean;
  pfItemsError: string | null;
  itemById: Map<string, Item>;
  itemOptions: Item[];
  basePfId: string;
  requestedBy: string;
  requestQuantity: number | "";
  companionDraft: CompanionDraftLine[];
  customPaName: string;
  customPfName: string;
  notes: string;
  draftLines: DraftLine[];
  matchResult: ShippingBomMatchResponse | null;
  canEditDraft: boolean;
  pending: PendingAction;
  wizardStep: RequestWizardStep;
  onWizardStep: (step: RequestWizardStep) => void;
  onNew: () => void;
  onSelectRequest: (req: ShippingRequest) => void;
  onBasePfChange: (value: string) => void;
  onRequestedBy: (value: string) => void;
  onRequestQuantity: (value: number | "") => void;
  onCustomPaName: (value: string) => void;
  onCustomPfName: (value: string) => void;
  onStatusChange: (status: string) => void;
  onNameValidationNotice: (message: string) => void;
  onNotes: (value: string) => void;
  onUpdateLine: (key: string, patch: Partial<DraftLine>) => void;
  onAddLine: (stage: "PA" | "PF", itemId: string) => void;
  onRemoveLine: (key: string) => void;
  onAddCompanion: (itemId: string) => void;
  onUpdateCompanion: (key: string, patch: Partial<CompanionDraftLine>) => void;
  onRemoveCompanion: (key: string) => void;
  onSave: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const sortedDraftLines = useMemo(
    () => sortShippingDraftLines(props.draftLines, props.itemById),
    [props.draftLines, props.itemById],
  );
  const grouped = {
    PA: sortedDraftLines.filter((line) => line.parent_stage === "PA"),
    PF: sortedDraftLines.filter((line) => line.parent_stage === "PF"),
  };
  const [pfQuery, setPfQuery] = useState("");
  const requestQuantityRef = useRef<HTMLInputElement | null>(null);
  const [focusRequestQuantity, setFocusRequestQuantity] = useState(false);
  const filteredPfItems = useMemo(() => filterItems(props.pfItems, pfQuery), [props.pfItems, pfQuery]);
  const locked = !props.canEditDraft;
  const requiresPaName = Boolean(props.matchResult?.requires_pa_name);
  const requiresPfName = Boolean(props.matchResult?.requires_pf_name);
  const reusingExistingPa = Boolean(props.matchResult?.matched_pa_item_id);
  const reusingExistingPf = Boolean(props.matchResult?.matched_pf_item_id);
  const basePfItem = props.pfItems.find((item) => item.item_id === props.basePfId) ?? props.itemById.get(props.basePfId);
  const basePaLine = props.draftLines.find((line) => (
    line.parent_stage === "PF"
    && props.itemById.get(line.child_item_id)?.process_type_code === "PA"
  ));
  const basePaItem = basePaLine ? props.itemById.get(basePaLine.child_item_id) : undefined;
  const basePaName = basePaItem?.item_name.trim() ?? "";
  const basePfName = basePfItem?.item_name.trim() ?? "";
  const paNameNeedsChange = requiresPaName && (!props.customPaName.trim() || props.customPaName.trim() === basePaName);
  const pfNameNeedsChange = requiresPfName && (!props.customPfName.trim() || props.customPfName.trim() === basePfName);
  const missingNewBomNames = Boolean(props.matchResult && (paNameNeedsChange || pfNameNeedsChange));
  const validRequestQuantity = isValidPositiveInt(props.requestQuantity);
  const finalActionIsUpdateOnly = props.selectedRequest?.status === "PREPARING";
  const finalActionDisabled = props.pending !== null || locked || !props.basePfId || !validRequestQuantity || missingNewBomNames || props.selectedRequest?.status === "PREPARED";
  const stepTitles = ["기준 PF 선택", "BOM 구성 조정", "BOM 매칭", "요청 정보", "저장 및 전환"];
  const matchedPaItem = props.matchResult?.matched_pa_item_id ? props.itemById.get(props.matchResult.matched_pa_item_id) : undefined;
  const matchedPfItem = props.matchResult?.matched_pf_item_id ? props.itemById.get(props.matchResult.matched_pf_item_id) : undefined;
  const itemCodeText = (item?: Item | null) => item?.mes_code ?? item?.process_type_code ?? "-";
  const itemNameText = (item?: Item | null, fallback = "-") => item?.item_name ?? fallback;
  const generatedCodeNotice = "품목코드는 저장/준비 완료 시 자동 생성 예정";
  const generatedCodeSummary = (previewCode: string | null | undefined) => previewCode
    ? { code: previewCode }
    : { code: generatedCodeNotice };
  const finalPaSummary = reusingExistingPa
    ? { label: "기존 PA 재사용", name: props.matchResult?.matched_pa_item_name ?? itemNameText(matchedPaItem), code: itemCodeText(matchedPaItem) }
    : requiresPaName
      ? { label: "새 PA 생성 예정", name: props.customPaName.trim() || "새 PA 이름 미입력", ...generatedCodeSummary(props.matchResult?.preview_pa_mes_code) }
      : { label: "PA 변경 없음", name: "요청 BOM 기준", code: "-" };
  const finalPfSummary = reusingExistingPf
    ? { label: "기존 PF 재사용", name: props.matchResult?.matched_pf_item_name ?? itemNameText(matchedPfItem), code: itemCodeText(matchedPfItem) }
    : requiresPfName
      ? { label: "새 PF 생성 예정", name: props.customPfName.trim() || "새 PF 이름 미입력", ...generatedCodeSummary(props.matchResult?.preview_pf_mes_code) }
      : { label: "PF 변경 없음", name: "요청 BOM 기준", code: "-" };
  const paRequirementTitle = requiresPaName || reusingExistingPa ? finalPaSummary.name : basePaName || finalPaSummary.name;
  const pfRequirementTitle = requiresPfName || reusingExistingPf ? finalPfSummary.name : basePfName || finalPfSummary.name;
  const bomChangedLines = props.draftLines.filter((line) => line.origin === "CUSTOM" || !line.included);
  const requestQty = toPositiveInt(props.requestQuantity);
  const shipmentName = reusingExistingPf || requiresPfName
    ? finalPfSummary.name
    : basePfItem?.item_name ?? finalPfSummary.name ?? "출하 품목 미선택";
  const shipmentCode = reusingExistingPf || requiresPfName
    ? finalPfSummary.code
    : basePfItem ? itemCodeText(basePfItem) : finalPfSummary.code;
  const hasBomChanges = bomChangedLines.length > 0;
  const canOpenStep = (step: RequestWizardStep) => {
    if (locked && step !== props.wizardStep) return false;
    if (props.pending !== null && step !== props.wizardStep) return false;
    if (step >= 2 && (!props.basePfId || !validRequestQuantity)) return false;
    if (step >= 4 && missingNewBomNames) return false;
    return true;
  };
  const canGoNext = props.pending === null && !locked && (
    props.wizardStep === 1 ? Boolean(props.basePfId && validRequestQuantity) :
    props.wizardStep === 2 ? true :
    props.wizardStep === 3 ? !missingNewBomNames :
    props.wizardStep < 5
  );
  const nameChangePromptActive = props.wizardStep === 3 && missingNewBomNames && props.pending === null && !locked;
  const footerHint = props.wizardStep === 1 && !props.basePfId
    ? "기준 PF를 먼저 선택하세요."
    : !validRequestQuantity
      ? "출하 수량을 1대 이상으로 입력하세요."
      : props.wizardStep >= 3
        ? `현재 출하 수량 ${requestQty}대 · 변경은 상단 수량 변경`
        : `현재 출하 수량 ${requestQty}대`;
  const goPrev = () => props.onWizardStep(Math.max(1, props.wizardStep - 1) as RequestWizardStep);
  const goNext = () => {
    if (nameChangePromptActive) {
      const required = [paNameNeedsChange ? "PA" : null, pfNameNeedsChange ? "PF" : null].filter(Boolean).join("/");
      props.onNameValidationNotice(`새 ${required} 품명을 수정하세요.`);
      return;
    }
    if (!canGoNext) return;
    props.onWizardStep(Math.min(5, props.wizardStep + 1) as RequestWizardStep);
  };
  const goEditQuantity = () => {
    if (props.pending !== null) return;
    setFocusRequestQuantity(true);
    props.onWizardStep(1);
  };

  useEffect(() => {
    if (!focusRequestQuantity || props.wizardStep !== 1) return;
    requestQuantityRef.current?.focus();
    requestQuantityRef.current?.select();
    setFocusRequestQuantity(false);
  }, [focusRequestQuantity, props.wizardStep]);

  return (
    <div data-testid="shipping-request-work-shell" className={SHIPPING_FLEX_COL_CLASS}>
      <div data-testid="shipping-work-header" className="grid min-w-0 gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
          <div className={SHIPPING_ROW_CLASS}>
            <button type="button" aria-label="이전 화면" onClick={props.onBack} className={SHIPPING_ICON_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div data-testid="shipping-work-title">
              <PanelTitle
                icon={PackageCheck}
                title={props.editingId ? "출하 요청 수정" : "출하 요청 작성"}
              />
            </div>
          </div>
          <div data-testid="shipping-step-tabs" className="grid min-w-0 gap-1 md:grid-cols-5">
            {stepTitles.map((title, index) => {
              const step = (index + 1) as RequestWizardStep;
              const active = props.wizardStep === step;
              const complete = props.wizardStep > step;
              const tone = active ? LEGACY_COLORS.blue : complete ? LEGACY_COLORS.green : LEGACY_COLORS.muted2;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => {
                    if (canOpenStep(step)) props.onWizardStep(step);
                  }}
                  disabled={!canOpenStep(step)}
                  className="min-h-12 rounded-[14px] border px-3 py-2 text-left text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: active ? tint(tone, 16) : LEGACY_COLORS.s2, borderColor: active ? tone : LEGACY_COLORS.border, color: tone }}
                >
                  <span className="block truncate whitespace-nowrap">{step + ". " + title}</span>
                </button>
              );
            })}
          </div>
          {props.selectedRequest ? <StatusBadge status={props.selectedRequest.status} /> : <span />}
      </div>

        {locked && (
          <div className="mt-3">
            <Notice tone={LEGACY_COLORS.yellow} title="수정 잠금" body="준비 완료 상태입니다." />
          </div>
        )}

      <div data-testid="shipping-wizard-content-frame" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
          {props.wizardStep === 1 && (
            <WorkStep number={1} title="기준 PF 선택" body="PF·수량" dataTestId="shipping-wizard-step-1" showHeader={false}>
              <div className="flex h-full min-h-0 flex-col gap-3">
                <Field label="PF 검색">
                  <input
                    data-testid="shipping-pf-search"
                    aria-label="PF 검색"
                    value={pfQuery}
                    disabled={locked || props.pending !== null}
                    onChange={(event) => setPfQuery(event.target.value)}
                    className={SHIPPING_TEXT_INPUT_CLASS}
                    style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    placeholder="PF 코드/품명 검색"
                  />
                </Field>
                <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto rounded-[14px] border p-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {props.pfItemsLoading ? (
                    <EmptyState title="PF 후보를 불러오는 중입니다." body="잠시만 기다려주세요." />
                  ) : props.pfItemsError ? (
                    <EmptyState title="PF 후보를 불러오지 못했습니다." body={props.pfItemsError} />
                  ) : filteredPfItems.length === 0 ? (
                    <EmptyState title="선택 가능한 PF 없음" body="검색어를 바꾸거나 품목 목록을 확인하세요." />
                  ) : (
                    filteredPfItems.slice(0, 80).map((item) => {
                      const selected = props.basePfId === item.item_id;
                      return (
                        <button
                          key={item.item_id}
                          type="button"
                          data-testid={`shipping-pf-option-${item.item_id}`}
                          onClick={() => props.onBasePfChange(item.item_id)}
                          disabled={locked || props.pending !== null}
                          className="flex min-h-12 items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition-all hover:brightness-110 disabled:opacity-50"
                          style={{ background: selected ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s1, borderColor: selected ? tint(LEGACY_COLORS.blue, 45) : LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black">{item.item_name}</span>
                            <SummaryCode code={item.mes_code ?? item.process_type_code ?? "-"} testId={`shipping-pf-option-code-${item.item_id}`} />
                          </span>
                          {selected && <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </WorkStep>
          )}

          {props.wizardStep === 2 && (
            <WorkStep number={2} title="BOM 구성 조정" body="BOM·동반품" dataTestId="shipping-wizard-step-2" showHeader={false}>
              {!props.basePfId ? (
                <EmptyState title="기준 PF를 먼저 선택하세요" body="PF를 선택하면 PA 구성품과 PF 구성품을 나눠 보여줍니다." />
              ) : (
                <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
                  <BomEditor basePfName={basePfName} stage="PA" lines={grouped.PA} itemById={props.itemById} itemOptions={props.itemOptions} disabled={locked} onUpdate={props.onUpdateLine} onAdd={props.onAddLine} onRemove={props.onRemoveLine} />
                  <BomEditor basePfName={basePfName} stage="PF" lines={grouped.PF} itemById={props.itemById} itemOptions={props.itemOptions} disabled={locked} onUpdate={props.onUpdateLine} onAdd={props.onAddLine} onRemove={props.onRemoveLine} />
                  <CompanionEditor lines={props.companionDraft} itemById={props.itemById} itemOptions={props.itemOptions} disabled={locked} onAdd={props.onAddCompanion} onUpdate={props.onUpdateCompanion} onRemove={props.onRemoveCompanion} />
                </div>
              )}
            </WorkStep>
          )}

          {props.wizardStep === 3 && (
            <section data-testid="shipping-wizard-step-3" className="flex h-full min-h-0 flex-col">
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,7fr)_minmax(120px,3fr)_auto] gap-4 overflow-y-auto pr-1">
                <ShippingConclusionCard
                  metrics={[
                    { value: finalPaSummary.label, name: finalPaSummary.name, code: finalPaSummary.code, tone: processTypeColor("PA"), testId: "shipping-final-pa-summary" },
                    { value: finalPfSummary.label, name: finalPfSummary.name, code: finalPfSummary.code, tone: processTypeColor("PF"), testId: "shipping-final-pf-summary" },
                  ]}
                />
                <div data-testid="shipping-match-quantity" className="flex min-h-[120px] flex-wrap items-center justify-between gap-3 rounded-[14px] border px-5 py-4" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
                  <span className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>출하 수량 {requestQty}대</span>
                  <button
                    type="button"
                    data-testid="shipping-quantity-change"
                    onClick={goEditQuantity}
                    disabled={props.pending !== null}
                    className="inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ background: tint(LEGACY_COLORS.blue, 12), borderColor: tint(LEGACY_COLORS.blue, 40), color: LEGACY_COLORS.blue }}
                  >
                    수량 변경
                  </button>
                </div>
                {hasBomChanges && (
                  <div data-testid="shipping-bom-change-table">
                    <BomChangeSummaryCard lines={bomChangedLines} itemById={props.itemById} />
                  </div>
                )}
              </div>
            </section>
          )}

          {props.wizardStep === 4 && (
            <section data-testid="shipping-wizard-step-4" className="flex h-full min-h-0 flex-col">
              <div data-testid="shipping-request-info-fields" className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
                <div data-testid="shipping-requester-summary" className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
                  <div className="min-w-0">
                    <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>요청자</div>
                    <div className="truncate text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{props.requestedBy || "로그인 사용자 없음"}</div>
                  </div>
                  <span className="rounded-full px-3 py-1.5 text-xs font-black" style={{ background: tint(LEGACY_COLORS.blue, 14), color: LEGACY_COLORS.blue }}>로그인 사용자 자동 반영</span>
                </div>
                <div className="flex min-h-0 flex-col gap-1">
                  <span className="text-xs font-black uppercase" style={{ color: LEGACY_COLORS.muted2 }}>요청 메모</span>
                  <textarea aria-label="요청 메모" value={props.notes} disabled={locked} onChange={(event) => props.onNotes(event.target.value)} className="min-h-0 flex-1 w-full min-w-0 resize-none rounded-[12px] border px-4 py-4 text-base font-bold leading-7 outline-none focus-visible:ring-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} placeholder="출하 준비자가 알아야 할 변경 사항" />
                </div>
              </div>
            </section>
          )}

          {props.wizardStep === 5 && (
            <section data-testid="shipping-wizard-step-5" className="flex h-full min-h-0 flex-col">
              <div data-testid="shipping-final-summary" className={`grid h-full min-h-0 content-start ${hasBomChanges ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]"} gap-3 overflow-hidden pr-1`}>
                <ShippingShipmentHero name={shipmentName} code={shipmentCode} />
                <FinalRequirementReview
                  paLines={grouped.PA.filter((line) => line.included)}
                  pfLines={grouped.PF.filter((line) => line.included)}
                  companionLines={props.companionDraft}
                  paTitle={paRequirementTitle}
                  pfTitle={pfRequirementTitle}
                  paCode={requiresPaName ? finalPaSummary.code : undefined}
                  pfCode={requiresPfName ? finalPfSummary.code : undefined}
                  newPaName={requiresPaName && requiresPfName ? finalPaSummary.name : null}
                  newPaCode={requiresPaName && requiresPfName ? finalPaSummary.code : null}
                  itemById={props.itemById}
                  requestQuantity={requestQty}
                />
                {hasBomChanges && (
                  <BomChangeSummaryCard lines={bomChangedLines} itemById={props.itemById} dataTestId="shipping-final-bom-changes" scrollListTestId="shipping-final-bom-change-list" finalLayout />
                )}
              </div>
            </section>
          )}
        </div>


        <div data-testid="shipping-wizard-action-bar" className={`mt-3 grid items-center gap-2 rounded-[14px] border p-3 ${props.wizardStep === 5 ? "md:grid-cols-[auto_minmax(0,1fr)_auto_auto]" : "md:grid-cols-[auto_minmax(0,1fr)_auto]"}`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <button type="button" onClick={goPrev} disabled={props.wizardStep === 1 || props.pending !== null} className="inline-flex min-h-11 items-center justify-center rounded-[12px] border px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>이전</button>
          <div data-testid="shipping-wizard-action-center" className="min-w-0">
            {props.wizardStep === 1 ? (
              <div data-testid="shipping-request-quantity-field" className="mx-auto w-fit">
                <QuantityStepper
                  value={requestQty}
                  onChange={props.onRequestQuantity}
                  label="출하 수량"
                  min={1}
                  step={1}
                  inputRef={requestQuantityRef}
                  disabled={locked || props.pending !== null}
                />
              </div>
            ) : props.wizardStep === 3 && (requiresPaName || requiresPfName) ? (
              <div data-testid="shipping-match-name-inputs" className={`grid min-w-0 gap-2 ${requiresPaName && requiresPfName ? "md:grid-cols-2" : ""}`}>
              {requiresPaName && (
                <Field label="새 PA 이름">
                  <input
                    data-testid="shipping-new-pa-name"
                    data-name-state={paNameNeedsChange ? "reference" : "edited"}
                    aria-label="새 PA 이름"
                    value={props.customPaName}
                    disabled={locked}
                    onChange={(event) => props.onCustomPaName(event.target.value)}
                    className={SHIPPING_TEXT_INPUT_CLASS}
                    style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: paNameNeedsChange ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}
                    placeholder="새 PA 품목명"
                  />
                </Field>
              )}
              {requiresPfName && (
                <Field label="새 PF 이름">
                  <input
                    data-testid="shipping-new-pf-name"
                    data-name-state={pfNameNeedsChange ? "reference" : "edited"}
                    aria-label="새 PF 이름"
                    value={props.customPfName}
                    disabled={locked}
                    onChange={(event) => props.onCustomPfName(event.target.value)}
                    className={SHIPPING_TEXT_INPUT_CLASS}
                    style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: pfNameNeedsChange ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}
                    placeholder="새 PF 품목명"
                  />
                </Field>
              )}
              </div>
            ) : props.wizardStep === 3 ? (
              hasBomChanges ? null : (
                <div className="flex min-h-11 items-center justify-center rounded-[12px] border px-3 text-center" style={{ background: tint(LEGACY_COLORS.green, 9), borderColor: tint(LEGACY_COLORS.green, 30) }}>
                  <span className="text-sm font-black" style={{ color: LEGACY_COLORS.green }}>BOM 변경 없음</span>
                  <span className="ml-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>기본 BOM 구성을 그대로 사용합니다.</span>
                </div>
              )
            ) : props.wizardStep === 4 ? null : props.wizardStep === 5 ? (
              <ShippingRequestMemoCard requester={props.requestedBy || "로그인 사용자 없음"} notes={props.notes} />
            ) : (
              <div className="min-w-0 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{footerHint}</div>
            )}
          </div>
          {props.wizardStep === 5 && (
            <div data-testid="shipping-final-action-quantity" className="inline-flex shrink-0 items-baseline justify-center gap-2 rounded-[10px] border px-3 py-2" style={{ background: LEGACY_COLORS.bg, borderColor: tint(LEGACY_COLORS.blue, 24) }}>
              <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>출하 수량</span>
              <span className="text-xl font-black" style={{ color: LEGACY_COLORS.blue }}> {requestQty}대</span>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {props.wizardStep < 5 ? (
              <button
                type="button"
                data-testid="shipping-wizard-next"
                data-name-validation={nameChangePromptActive ? "pending" : "ready"}
                aria-disabled={!canGoNext && !nameChangePromptActive}
                onClick={goNext}
                disabled={!canGoNext && !nameChangePromptActive}
                className={`inline-flex min-h-11 items-center justify-center rounded-[12px] border px-5 py-2 text-sm font-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${nameChangePromptActive ? "opacity-40" : ""}`}
                style={{ background: tint(LEGACY_COLORS.blue, 16), borderColor: tint(LEGACY_COLORS.blue, 48), color: LEGACY_COLORS.blue }}
              >다음</button>
            ) : (
              <PrimaryActionButton
                icon={finalActionIsUpdateOnly ? CheckCircle2 : Send}
                label={finalActionIsUpdateOnly ? (props.pending === "save" ? "반영 중" : "변경사항 반영") : (props.pending === "send" ? "요청 중" : "출하 요청")}
                tone={finalActionIsUpdateOnly ? LEGACY_COLORS.blue : LEGACY_COLORS.green}
                onClick={finalActionIsUpdateOnly ? props.onSave : props.onSend}
                disabled={finalActionDisabled}
                dataTestId="shipping-send-to-prep"
              />
            )}
          </div>
      </div>
    </div>
  );
}

type ShippingShortageKind = "출하품" | "PA 구성품" | "PF 구성품" | "동반 출하품" | "준비 품목";

function buildShippingShortageKindMap(request: ShippingRequest | null): Map<string, ShippingShortageKind> {
  const kinds = new Map<string, ShippingShortageKind>();
  if (!request) return kinds;

  const setIfEmpty = (itemId: string | null | undefined, kind: ShippingShortageKind): void => {
    if (!itemId || kinds.has(itemId)) return;
    kinds.set(itemId, kind);
  };

  setIfEmpty(request.final_pf_item_id ?? request.base_pf_item_id, "출하품");
  request.bom_lines.forEach((line) => {
    if (!line.included) return;
    setIfEmpty(line.child_item_id, line.parent_stage === "PA" ? "PA 구성품" : "PF 구성품");
  });
  request.companion_lines.forEach((line) => setIfEmpty(line.item_id, "동반 출하품"));
  return kinds;
}

function PrepSection({
  showList = true,
  requests,
  selected,
  pending,
  onSelect,
  onOpenPrepare,
  onCancel,
  onPickup,
}: {
  showList?: boolean;
  requests: ShippingRequest[];
  selected: ShippingRequest | null;
  pending: PendingAction;
  onSelect: (req: ShippingRequest) => void;
  onOpenPrepare: (req: ShippingRequest) => void;
  onCancel: (req: ShippingRequest) => void;
  onPickup: (req: ShippingRequest) => void;
}) {
  const requestQty = selected?.request_quantity ?? 1;
  const paLines = selected?.bom_lines.filter((line) => line.included && line.parent_stage === "PA") ?? [];
  const pfLines = selected?.bom_lines.filter((line) => line.included && line.parent_stage === "PF") ?? [];
  const stockShortages = selected?.stock_shortages ?? EMPTY_STOCK_SHORTAGES;
  const shortageByItemId = useMemo(() => new Map(stockShortages.map((line) => [line.item_id, line])), [stockShortages]);
  const shortageKindByItemId = useMemo(() => buildShippingShortageKindMap(selected), [selected]);

  return (
    <div className={showList ? "grid min-h-[620px] gap-3 xl:grid-cols-[360px_minmax(0,1fr)]" : "flex min-h-0 flex-1 flex-col"}>
      {showList && (
        <Panel>
          <PanelTitle icon={ClipboardCheck} title="준비 작업" subtitle="PC에서는 출하 수량과 구성 요약을 확인합니다." />
          <div className="mt-3 flex flex-col gap-2">
            {requests.length === 0 ? (
              <EmptyState title="준비 중 요청 없음" body="출하 요청을 만들면 여기에 표시됩니다." />
            ) : (
              requests.map((req) => (
                <RequestRow key={req.request_id} request={req} active={selected?.request_id === req.request_id} onClick={() => onSelect(req)} />
              ))
            )}
          </div>
        </Panel>
      )}

      <Panel dataTestId="shipping-prep-detail" className="flex min-h-0 flex-col">
        {!selected ? (
          <EmptyState title="선택된 준비 작업 없음" body="준비 작업을 선택하세요." />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className={SHIPPING_TOP_ROW_CLASS}>
              <PanelTitle icon={Truck} title={selected.base_pf_item_name} subtitle={`총 ${requestQty}대 출하 · 요청자 ${selected.requested_by_name ?? "-"} · ${formatDate(selected.created_at)}`} />
              <StatusBadge status={selected.status} />
            </div>

            {selected.notes && <Notice tone={LEGACY_COLORS.cyan} title="요청 메모" body={selected.notes} />}

            {stockShortages.length > 0 && <StockShortageNotice shortages={stockShortages} kindByItemId={shortageKindByItemId} />}

            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="출하 수량" value={`${requestQty}대`} />
              <Metric label="PA 구성품" value={`${paLines.length}개 품목`} />
              <Metric label="PF 구성품" value={`${pfLines.length}개 품목`} />
            </div>

            <div data-testid="shipping-prep-requirements" className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
              <PrepRequirementList title="PA 구성품" lines={paLines} requestQuantity={requestQty} tone={processTypeColor("PA")} shortageByItemId={shortageByItemId} shortageKindByItemId={shortageKindByItemId} />
              <PrepRequirementList title="PF 구성품" lines={pfLines} requestQuantity={requestQty} tone={processTypeColor("PF")} shortageByItemId={shortageByItemId} shortageKindByItemId={shortageKindByItemId} />
              <CompanionPrepList lines={selected.companion_lines} shortageByItemId={shortageByItemId} shortageKindByItemId={shortageKindByItemId} />
            </div>

            <div data-testid="shipping-prep-actions" className="flex shrink-0 flex-wrap justify-end gap-2 rounded-[14px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              {selected.status === "PREPARING" && (
                <ActionButton icon={PackageCheck} label={pending === "prepare" ? "처리 중" : "준비 완료"} tone={LEGACY_COLORS.green} onClick={() => onOpenPrepare(selected)} disabled={pending !== null} />
              )}
              {selected.status === "PREPARED" && (
                <>
                  <ActionButton icon={RotateCcw} label={pending === "cancel" ? "취소 중" : "준비 완료 취소"} tone={LEGACY_COLORS.yellow} onClick={() => onCancel(selected)} disabled={pending !== null} />
                  <ActionButton icon={Truck} label={pending === "pickup" ? "처리 중" : "픽업 완료"} tone={LEGACY_COLORS.purple} onClick={() => onPickup(selected)} disabled={pending !== null} />
                </>
              )}
            </div>

            {selected.status === "PREPARED" && (
              <TransactionLogList title="재고 반영 이력" logs={selected.transactions.filter((log) => log.shipping_phase === "PREPARE")} />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function StockShortageNotice({
  shortages,
  kindByItemId,
}: {
  shortages: ShippingRequest["stock_shortages"];
  kindByItemId: Map<string, ShippingShortageKind>;
}) {
  return (
    <div
      data-testid="shipping-stock-shortages"
      className="rounded-[14px] border p-3"
      style={{
        background: tint(LEGACY_COLORS.red, 10),
        borderColor: tint(LEGACY_COLORS.red, 35),
        color: LEGACY_COLORS.text,
      }}
    >
      <div className="text-sm font-black" style={{ color: LEGACY_COLORS.red }}>
        재고 부족
      </div>
      <div className="mt-2 grid gap-2">
        {shortages.map((line) => {
          const kind = kindByItemId.get(line.item_id) ?? "준비 품목";
          return (
          <div
            key={`${line.phase}-${line.item_id}`}
            data-testid={`shipping-shortage-summary-${line.item_id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-3 py-2"
            style={{ background: LEGACY_COLORS.bg }}
          >
            <span className="min-w-0">
              <span className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: tint(LEGACY_COLORS.red, 14), color: LEGACY_COLORS.red }}>{kind}</span>
              <span className="block line-clamp-2 text-sm font-black leading-snug">{line.item_name}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                <SummaryCode code={line.mes_code ?? "-"} testId={`shipping-shortage-code-${line.item_id}`} />
                <span>· {line.department ?? "-"}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-black tabular-nums" style={{ color: LEGACY_COLORS.red }}>
              {line.shortage_quantity}개 부족
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function PrepRequirementList({
  title,
  lines,
  requestQuantity,
  tone,
  shortageByItemId,
  shortageKindByItemId,
}: {
  title: string;
  lines: ShippingRequest["bom_lines"];
  requestQuantity: number;
  tone: string;
  shortageByItemId: Map<string, ShippingRequest["stock_shortages"][number]>;
  shortageKindByItemId: Map<string, ShippingShortageKind>;
}) {
  return (
    <div className={SHIPPING_PANEL_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 text-sm font-black" style={{ color: tone }}>{title}</div>
      <div className={SHIPPING_SCROLL_LIST_CLASS}>
        {lines.length === 0 ? (
          <div className={SHIPPING_EMPTY_BOX_CLASS} style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>구성품 없음</div>
        ) : (
          lines.map((line) => {
            const shortage = shortageByItemId.get(line.child_item_id);
            const shortageKind = shortage ? shortageKindByItemId.get(line.child_item_id) ?? "준비 품목" : null;
            const unit = line.unit || "EA";
            return (
              <div
                key={line.line_id ?? `${line.parent_stage}-${line.child_item_id}`}
                data-testid={`shipping-prep-line-${line.child_item_id}`}
                data-shortage={shortage ? "true" : "false"}
                className={SHIPPING_CELL_CLASS}
                style={{ background: shortage ? tint(LEGACY_COLORS.red, 8) : LEGACY_COLORS.bg, borderColor: shortage ? tint(LEGACY_COLORS.red, 42) : LEGACY_COLORS.border }}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    {shortageKind && (
                      <span data-testid={`shipping-shortage-kind-${line.child_item_id}`} className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: tint(LEGACY_COLORS.red, 14), color: LEGACY_COLORS.red }}>
                        {shortageKind}
                      </span>
                    )}
                    <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</div>
                  </div>
                  {shortage && (
                    <span data-testid={`shipping-shortage-badge-${line.child_item_id}`} className="shrink-0 rounded-full px-2 py-1 text-[11px] font-black tabular-nums" style={{ background: tint(LEGACY_COLORS.red, 14), color: LEGACY_COLORS.red }}>
                      {shortage.shortage_quantity} {unit} 부족
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  <SummaryCode code={line.mes_code ?? "코드 없음"} testId={`shipping-prep-code-${line.child_item_id}`} />
                  <span>1대 기준 {line.quantity}{line.unit ? ` ${line.unit}` : ""}</span>
                  <span>총 필요 {line.quantity * requestQuantity}{line.unit ? ` ${line.unit}` : ""}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CompanionPrepList({
  lines,
  shortageByItemId,
  shortageKindByItemId,
}: {
  lines: ShippingRequest["companion_lines"];
  shortageByItemId: Map<string, ShippingRequest["stock_shortages"][number]>;
  shortageKindByItemId: Map<string, ShippingShortageKind>;
}) {
  return (
    <div className={SHIPPING_PANEL_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 text-sm font-black" style={{ color: LEGACY_COLORS.purple }}>카톤·동반 출하품</div>
      <div className={SHIPPING_SCROLL_LIST_CLASS}>
        {lines.length === 0 ? (
          <div className={SHIPPING_EMPTY_BOX_CLASS} style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>입력 없음</div>
        ) : (
          lines.map((line) => {
            const shortage = shortageByItemId.get(line.item_id);
            const shortageKind = shortage ? shortageKindByItemId.get(line.item_id) ?? "준비 품목" : null;
            const unit = line.unit || "EA";
            return (
              <div
                key={line.line_id ?? line.item_id}
                data-testid={`shipping-prep-line-${line.item_id}`}
                data-shortage={shortage ? "true" : "false"}
                className={SHIPPING_CELL_CLASS}
                style={{ background: shortage ? tint(LEGACY_COLORS.red, 8) : LEGACY_COLORS.bg, borderColor: shortage ? tint(LEGACY_COLORS.red, 42) : LEGACY_COLORS.border }}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    {shortageKind && (
                      <span data-testid={`shipping-shortage-kind-${line.item_id}`} className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: tint(LEGACY_COLORS.red, 14), color: LEGACY_COLORS.red }}>
                        {shortageKind}
                      </span>
                    )}
                    <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</div>
                  </div>
                  {shortage && (
                    <span data-testid={`shipping-shortage-badge-${line.item_id}`} className="shrink-0 rounded-full px-2 py-1 text-[11px] font-black tabular-nums" style={{ background: tint(LEGACY_COLORS.red, 14), color: LEGACY_COLORS.red }}>
                      {shortage.shortage_quantity} {unit} 부족
                    </span>
                  )}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  <SummaryCode code={line.mes_code ?? "코드 없음"} testId={`shipping-companion-prep-code-${line.item_id}`} />
                  <span>· 총 {line.quantity}{line.unit ? ` ${line.unit}` : ""}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
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
      <Panel dataTestId="shipping-history-detail">
        {!selected ? (
          <EmptyState title="선택된 이력 없음" body="왼쪽에서 완료 이력을 선택하세요." />
        ) : (
          <div className="grid gap-4">
            <div className={SHIPPING_TOP_ROW_CLASS}>
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
                    <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{shippingEventMessage(event)}</span>
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

function ItemSearchAdd({
  query,
  setQuery,
  itemOptions,
  disabled,
  inputTestId,
  buttonTestPrefix,
  ariaLabel,
  placeholder,
  tone,
  onAdd,
}: {
  query: string;
  setQuery: (value: string) => void;
  itemOptions: Item[];
  disabled: boolean;
  inputTestId: string;
  buttonTestPrefix: string;
  ariaLabel: string;
  placeholder: string;
  tone: string;
  onAdd: (itemId: string) => void;
}) {
  const filtered = useMemo(() => filterItems(itemOptions, query).slice(0, 24), [itemOptions, query]);
  return (
    <>
      <input
        data-testid={inputTestId}
        aria-label={ariaLabel}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-2 h-11 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2"
        style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        placeholder={placeholder}
      />
      {query.trim() && (
        <div className="mb-2 grid max-h-36 min-w-0 gap-1 overflow-x-hidden overflow-y-auto rounded-[12px] border p-1" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>검색 결과 없음</div>
          ) : filtered.map((item) => (
            <button key={item.item_id} type="button" data-testid={`${buttonTestPrefix}-${item.item_id}`} onClick={() => { onAdd(item.item_id); setQuery(""); }} disabled={disabled} className="flex min-h-10 min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[10px] px-2 text-left text-xs font-bold hover:brightness-110 disabled:opacity-45" style={{ background: LEGACY_COLORS.s1, color: LEGACY_COLORS.text }}>
              <span className="min-w-0"><span className="block truncate">{item.item_name}</span><SummaryCode code={item.mes_code ?? item.process_type_code ?? "-"} testId={`shipping-item-search-code-${item.item_id}`} className="block truncate" /></span>
              <span className="shrink-0 rounded-full px-2 py-1 font-black" style={{ background: tint(tone, 14), color: tone }}>추가</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function CompanionEditor({
  lines,
  itemById,
  itemOptions,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: {
  lines: CompanionDraftLine[];
  itemById: Map<string, Item>;
  itemOptions: Item[];
  disabled: boolean;
  onAdd: (itemId: string) => void;
  onUpdate: (key: string, patch: Partial<CompanionDraftLine>) => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div data-testid="shipping-companion-editor" className={`${SHIPPING_PANEL_CLASS} overflow-x-hidden`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>카톤·동반 출하품</div>
          <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>검색 결과에서 바로 추가합니다.</div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ background: tint(lines.length > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.yellow, 14), color: lines.length > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.yellow }}>
          선택 {lines.length}개
        </span>
      </div>
      <ItemSearchAdd query={query} setQuery={setQuery} itemOptions={itemOptions} disabled={disabled} inputTestId="shipping-companion-search" buttonTestPrefix="shipping-companion-add" ariaLabel="카톤·동반 출하품 검색" placeholder="동반 출하품 검색" tone={LEGACY_COLORS.cyan} onAdd={onAdd} />
      <div className="mt-2 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
        {lines.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center rounded-[12px] border text-xs font-bold" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>추가된 동반 출하품 없음</div>
        ) : (
          lines.map((line) => {
            const item = itemById.get(line.item_id);
            return (
              <div key={line.key} data-testid={`shipping-companion-line-${line.item_id}`} className="grid min-w-0 items-stretch gap-2 overflow-hidden rounded-[10px] border p-2 lg:grid-cols-[minmax(0,1fr)_90px_104px]" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                <div className="min-w-0 lg:contents">
                  <div className="line-clamp-2 break-words text-sm font-black leading-snug lg:col-start-1 lg:row-start-1" style={{ color: LEGACY_COLORS.text }}>{item?.item_name ?? "품목 없음"}</div>
                  <div className="mt-0.5 truncate text-xs font-bold lg:col-start-1 lg:row-start-2" style={{ color: LEGACY_COLORS.muted2 }}>
                    <SummaryCode code={item?.mes_code ?? "코드 없음"} testId={`shipping-companion-code-${line.item_id}`} />
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  disabled={disabled}
                  aria-label={`${item?.item_name ?? "동반 출하품"} 수량`}
                  onChange={(event) => onUpdate(line.key, { quantity: toPositiveInt(event.target.value), unit: item?.unit ?? line.unit ?? "EA" })}
                  className={`${SHIPPING_QTY_INPUT_CLASS} self-stretch lg:col-start-2 lg:row-start-1`}
                  style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
                <button type="button" aria-label={`${item?.item_name ?? "동반 출하품"} 제거`} onClick={() => onRemove(line.key)} disabled={disabled} className="inline-flex min-h-9 h-full self-stretch items-center justify-center gap-1 rounded-[9px] border px-2 text-xs font-black lg:col-start-3 lg:row-start-1" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}>
                  <Trash2 className="h-3.5 w-3.5" />
                  제거
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function BomEditor({
  basePfName,
  stage,
  lines,
  itemById,
  itemOptions,
  disabled,
  onUpdate,
  onAdd,
  onRemove,
}: {
  basePfName: string;
  stage: "PA" | "PF";
  lines: DraftLine[];
  itemById: Map<string, Item>;
  itemOptions: Item[];
  disabled: boolean;
  onUpdate: (key: string, patch: Partial<DraftLine>) => void;
  onAdd: (stage: "PA" | "PF", itemId: string) => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const stageLower = stage.toLowerCase();
  const stageLabel = `${stage} 구성품`;
  const title = `${basePfName} · ${stageLabel}`;
  const stageColor = processTypeColor(stage);
  return (
    <div data-testid={`shipping-bom-editor-${stageLower}`} className={SHIPPING_PANEL_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>
          {basePfName} · <span data-testid={`shipping-bom-title-stage-${stageLower}`} style={{ color: stageColor }}>{stageLabel}</span>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ background: tint(stageColor, 14), color: stageColor }}>
          {lines.filter((line) => line.included).length}개 포함
        </span>
      </div>
      <ItemSearchAdd query={query} setQuery={setQuery} itemOptions={itemOptions} disabled={disabled} inputTestId={`shipping-bom-search-${stageLower}`} buttonTestPrefix={`shipping-bom-add-${stageLower}`} ariaLabel={`${title} 검색`} placeholder="검색 후 추가" tone={stageColor} onAdd={(itemId) => onAdd(stage, itemId)} />
      <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
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
                data-bom-line-child={line.child_item_id}
                data-bom-line-included={String(line.included)}
                data-bom-line-origin={line.origin}
                className="grid min-w-0 items-stretch gap-2 rounded-[10px] border p-2 lg:grid-cols-[minmax(0,1fr)_90px_104px]"
                style={{ background: isExcluded ? tint(LEGACY_COLORS.red, 8) : LEGACY_COLORS.s1, borderColor: isExcluded ? tint(LEGACY_COLORS.red, 36) : LEGACY_COLORS.border }}
              >
                <div className="grid min-w-0 gap-1 lg:contents">
                  <div data-testid="shipping-bom-readonly-item" className="min-h-9 min-w-0 rounded-[9px] border px-3 py-2 lg:col-start-1 lg:row-start-1" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: isExcluded ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}>
                    <div className="line-clamp-2 break-words text-sm font-black leading-snug" title={item?.item_name ?? "품목 없음"}>{item?.item_name ?? "품목 없음"}</div>
                  </div>
                  <div data-testid="shipping-bom-line-meta" className="flex items-center gap-1.5 lg:col-start-1 lg:row-start-2 [&>span:last-child]:hidden">
                    <SummaryCode code={item?.mes_code ?? "-"} testId={`shipping-bom-code-${line.child_item_id}`} className="order-2" />
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
                  data-testid="shipping-bom-line-controls"
                  className={`${SHIPPING_QTY_INPUT_CLASS} self-stretch lg:col-start-2 lg:row-start-1`}
                  style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
                <button
                  type="button"
                  aria-label={actionLabel}
                  disabled={disabled}
                  onClick={() => (isCustom ? onRemove(line.key) : onUpdate(line.key, { included: !line.included }))}
                  className="inline-flex min-h-9 h-full self-stretch items-center justify-center gap-1 rounded-[9px] border px-2 text-xs font-black lg:col-start-3 lg:row-start-1"
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
            const showReference = log.reference_no && !log.reference_no.startsWith("SHIP-");
            const referenceLabel = showReference ? log.reference_no : `${phaseLabel(log.shipping_phase)} 작업`;
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
                  <div className="flex min-w-0 items-center gap-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    <SummaryCode code={log.mes_code ?? "-"} testId={`shipping-transaction-code-${log.log_id}`} />
                    <span className="truncate">· {log.notes ?? "메모 없음"}</span>
                  </div>
                </div>
                <div className="text-sm font-black md:text-right" style={{ color: log.quantity_change < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>
                  {log.quantity_change > 0 ? "+" : ""}{log.quantity_change}
                  <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{log.quantity_before ?? "-"}{" -> "}{log.quantity_after ?? "-"}</div>
                </div>
                <div className="min-w-0 text-xs font-bold md:text-right" style={{ color: LEGACY_COLORS.muted2 }}>
                  <div className="truncate">{referenceLabel}</div>
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
type SummaryDisplayLine = { key: string; title: string; code: string; quantity: string; tone?: string };

function LineSummary({ request }: { request: ShippingRequest }) {
  const paLines = request.bom_lines.filter((line) => line.parent_stage === "PA" && line.included);
  const pfLines = request.bom_lines.filter((line) => line.parent_stage === "PF" && line.included);
  const formatLine = (line: ShippingRequest["bom_lines"][number]): SummaryDisplayLine => {
    return {
      key: `${line.line_id ?? line.child_item_id}-${line.parent_stage}`,
      title: line.item_name,
      code: line.mes_code ?? "코드 없음",
      quantity: `${line.quantity}${line.unit ? " " + line.unit : ""}`,
    };
  };
  const companionLines = request.companion_lines.map((line) => ({
    key: line.line_id ?? line.item_id,
    title: line.item_name,
    code: line.mes_code ?? "코드 없음",
    quantity: `${line.quantity}${line.unit ? " " + line.unit : ""}`,
  }));
  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
      <SummaryList title="PA 구성품" lines={paLines.map(formatLine)} />
      <SummaryList title="PF 구성품" lines={pfLines.map(formatLine)} />
      <CompanionSummary lines={companionLines} />
    </div>
  );
}

function SummaryList({ title, lines, empty = "등록 없음" }: { title: string; lines: SummaryDisplayLine[]; empty?: string }) {
  return (
    <div className={SHIPPING_PANEL_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{title}</div>
      <div className={SHIPPING_SCROLL_LIST_CLASS}>
        {lines.length === 0 ? (
          <div className={SHIPPING_EMPTY_BOX_CLASS} style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{empty}</div>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="min-w-0 rounded-[12px] border px-3 py-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
              <div className="truncate text-sm font-black" style={{ color: line.tone ?? LEGACY_COLORS.text }}>{line.title}</div>
              <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                <SummaryCode code={line.code} testId={`shipping-summary-code-${line.key}`} />
                <span data-testid={`shipping-summary-quantity-${line.key}`} className="shrink-0 tabular-nums">{line.quantity}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCode({ code, testId, className }: { code: string; testId: string; className?: string }) {
  const segments = code.split("-");
  const hasClassifiedCode = segments.length === 3 && segments.every(Boolean);
  const kindColor = processTypeColor(hasClassifiedCode ? segments[1] : undefined);
  return (
    <span data-testid={testId} className={`min-w-0 truncate ${className ?? ""}`}>
      {hasClassifiedCode ? (
        <>
          {segments[0]}-<strong data-testid={`${testId}-kind`} className="font-black" style={{ color: kindColor }}>{segments[1]}</strong>-{segments[2]}
        </>
      ) : code}
    </span>
  );
}

function CompanionSummary({ lines }: { lines: SummaryDisplayLine[] }) {
  return <SummaryList title="카톤·동반 출하품" lines={lines} empty="픽업 전 입력 없음" />;
}

function ShippingActionConfirmModal({
  action,
  pending,
  onClose,
  onConfirm,
}: {
  action: ConfirmAction;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = action.kind === "prepare" ? "준비 완료 확인" : action.kind === "cancel" ? "준비 완료 취소 확인" : action.kind === "delete" ? "요청 취소 확인" : "픽업 완료 확인";
  const tone = action.kind === "prepare" ? LEGACY_COLORS.green : action.kind === "cancel" ? LEGACY_COLORS.yellow : action.kind === "delete" ? LEGACY_COLORS.red : LEGACY_COLORS.purple;
  const requestQty = action.request.request_quantity ?? 1;
  const description = action.kind === "prepare"
    ? "요청 수량만큼 하위 자재를 반영하고 최종 PA/PF 생산 로그를 남깁니다. 동반 출하품은 요청에 저장된 항목을 사용합니다."
    : action.kind === "cancel"
      ? "준비 완료 때 생성된 입출고 로그를 역재생해 재고를 원복합니다."
      : action.kind === "delete"
        ? action.request.status === "PREPARING"
          ? "재고 반영 전 요청이므로 요청과 준비 체크 내역을 삭제합니다."
          : "요청 상태의 출하 요청을 목록에서 삭제합니다. 이력은 남지 않습니다."
        : "최종 PF와 동반 출하품을 출하 처리합니다. v1에서는 픽업 완료 후 취소 기능이 없습니다.";
  const lines = action.kind === "prepare"
    ? [
        ...action.request.bom_lines.filter((line) => line.included).map((line) => `${line.parent_stage} · ${line.item_name} · 1대 ${line.quantity}${line.unit ? ` ${line.unit}` : ""} / 총 ${line.quantity * requestQty}${line.unit ? ` ${line.unit}` : ""}`),
        ...action.request.companion_lines.map((line) => `동반 · ${line.item_name} x ${line.quantity}${line.unit ? ` ${line.unit}` : ""}`),
      ]
    : action.kind === "cancel"
      ? action.request.transactions.filter((log) => log.shipping_phase === "PREPARE" && !log.cancelled).map((log) => `${txTypeLabel(log.transaction_type)} · ${log.item_name} ${log.quantity_change}`)
      : action.kind === "delete"
        ? [`기준 PF · ${action.request.base_pf_item_name}`]
        : [
          `최종 PF · ${action.request.final_pf_item_name ?? action.request.base_pf_item_name} x ${requestQty}`,
          ...action.request.companion_lines.map((line) => `동반 · ${line.item_name} x ${line.quantity}`),
        ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "color-mix(in srgb, var(--c-bg) 72%, transparent)" }}>
      <div className="w-full max-w-xl rounded-[18px] border p-5 shadow-xl" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
        <div className={SHIPPING_TOP_ROW_CLASS}>
          <PanelTitle icon={PackageCheck} title={title} subtitle={action.request.base_pf_item_name} />
          <StatusBadge status={action.request.status} />
        </div>
        <div className="mt-4 rounded-[12px] border px-3 py-2 text-sm font-bold" style={{ background: tint(tone, 10), borderColor: tint(tone, 35), color: LEGACY_COLORS.text }}>
          {description}
        </div>
        <div className="mt-3 grid max-h-[260px] gap-1 overflow-y-auto rounded-[12px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          {lines.length === 0 ? (
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>표시할 항목이 없습니다.</div>
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
          <ActionButton icon={CheckCircle2} label={pending ? "처리 중" : "확인 후 실행"} tone={tone} onClick={onConfirm} disabled={pending} dataTestId="shipping-confirm-action" />
        </div>
      </div>
    </div>
  );
}

function RequestRow({ request, active, onClick }: { request: ShippingRequest; active: boolean; onClick: () => void }) {
  const finalPfName = request.final_pf_item_name ?? request.base_pf_item_name;
  const baseLabel = request.final_pf_item_name && request.final_pf_item_name !== request.base_pf_item_name
    ? ` · 기준 ${request.base_pf_item_name}`
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      data-shipping-request-id={request.request_id}
      className="min-h-[136px] rounded-[14px] border px-4 py-3 text-left transition-colors"
      style={{
        background: active ? tint(STATUS_TONE[request.status], 16) : LEGACY_COLORS.s2,
        borderColor: active ? STATUS_TONE[request.status] : LEGACY_COLORS.border,
        color: LEGACY_COLORS.text,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{finalPfName}</div>
          <div className="flex min-w-0 items-center gap-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            <SummaryCode code={request.base_pf_mes_code ?? "-"} testId={`shipping-request-code-${request.request_id}`} />
            <span className="truncate">· {request.requested_by_name ?? "요청자 없음"}</span>
          </div>
        </div>
        <StatusBadge status={request.status} compact />
      </div>
      <div className="mt-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        생성 {formatDate(request.created_at)}{baseLabel}
      </div>
    </button>
  );
}

function Panel({ children, dataTestId, className }: { children: ReactNode; dataTestId?: string; className?: string }) {
  return (
    <div data-testid={dataTestId} className={`min-w-0 rounded-[24px] border p-4 ${className ?? ""}`} style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      {children}
    </div>
  );
}

function PanelTitle({ icon: Icon, title, subtitle }: { icon: typeof PackageCheck; title: string; subtitle?: string }) {
  return (
    <div className={SHIPPING_ROW_CLASS}>
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
    <div className={SHIPPING_CELL_CLASS} style={{ background: tint(tone, 10), borderColor: tint(tone, 45) }}>
      <div className="text-sm font-black" style={{ color: tone }}>{title}</div>
      <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{body}</div>
    </div>
  );
}

function ShippingConclusionCard({
  metrics,
}: {
  metrics: { value: string; name?: string; code?: string; tone?: string; testId?: string }[];
}) {
  return (
    <section data-testid="shipping-match-summary" className="grid h-full min-h-[168px] gap-3 md:grid-cols-2">
      {metrics.map((metric, index) => (
        <div key={metric.testId ?? metric.value} data-testid={metric.testId} className="min-w-0 rounded-[14px] border px-4 py-3" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
          <div data-testid={metric.testId ? `${metric.testId}-label` : undefined} className="text-base font-black leading-snug" style={{ color: metric.tone ?? LEGACY_COLORS.text }}>{metric.value}</div>
          {metric.name && (
            <div className="mt-1.5 min-w-0">
              <div data-testid={metric.testId ? `${metric.testId}-name` : undefined} className="line-clamp-2 text-sm font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>{metric.name}</div>
              <div className="mt-0.5 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                <SummaryCode code={metric.code ?? "-"} testId={metric.testId ? `${metric.testId}-code` : `shipping-match-code-${index}`} />
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function BomChangeSummaryCard({
  lines,
  itemById,
  dataTestId,
  scrollListTestId,
  finalLayout = false,
}: {
  lines: DraftLine[];
  itemById: Map<string, Item>;
  dataTestId?: string;
  scrollListTestId?: string;
  finalLayout?: boolean;
}) {
  if (lines.length === 0) {
    return <Notice tone={LEGACY_COLORS.green} title="BOM 변경 없음" body="기본 BOM 구성을 그대로 사용합니다." />;
  }
  return (
    <section data-testid={dataTestId} className={`rounded-[14px] border p-3 ${finalLayout ? "flex min-h-0 shrink-0 flex-col" : ""}`} style={{ background: tint(LEGACY_COLORS.yellow, 8), borderColor: tint(LEGACY_COLORS.yellow, 36) }}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-black leading-snug" style={{ color: LEGACY_COLORS.yellow }}>변경된 구성품 {lines.length}개</div>
      </div>
      <div data-testid={scrollListTestId} className={`grid min-h-0 gap-2 pr-1 ${finalLayout ? "h-[58px] grid-cols-2 overflow-x-hidden overflow-y-auto" : "max-h-[360px] overflow-y-auto xl:grid-cols-2"}`}>
        {lines.map((line) => {
          const item = itemById.get(line.child_item_id);
          const label = !line.included ? "제외" : line.origin === "CUSTOM" ? "추가" : "포함";
          const tone = !line.included ? LEGACY_COLORS.red : line.origin === "CUSTOM" ? LEGACY_COLORS.cyan : LEGACY_COLORS.green;
          return (
            <div key={line.key} data-testid="shipping-final-bom-change-row" className={`${SHIPPING_CELL_CLASS} ${finalLayout ? "h-[58px] overflow-hidden" : ""}`} style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className={`${finalLayout ? "truncate" : "line-clamp-2"} text-sm font-black leading-snug`} title={item?.item_name ?? "품목 없음"} style={{ color: LEGACY_COLORS.text }}>{item?.item_name ?? "품목 없음"}</div>
                <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-black" style={{ background: tint(tone, 14), color: tone }}>{label}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                <SummaryCode code={item?.mes_code ?? "코드 없음"} testId={`shipping-bom-change-code-${line.child_item_id}`} />
                <span>총 {line.quantity}{line.unit ? ` ${line.unit}` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type FinalRequirementRow = { id: string; testId: string; itemId?: string; itemName?: string; code?: string; quantity: number; unit: string };

function FinalRequirementReview({
  paLines,
  pfLines,
  companionLines,
  paTitle,
  pfTitle,
  paCode,
  pfCode,
  newPaName,
  newPaCode,
  itemById,
  requestQuantity,
}: {
  paLines: DraftLine[];
  pfLines: DraftLine[];
  companionLines: CompanionDraftLine[];
  paTitle: string;
  pfTitle: string;
  paCode?: string;
  pfCode?: string;
  newPaName: string | null;
  newPaCode: string | null;
  itemById: Map<string, Item>;
  requestQuantity: number;
}) {
  const paRows = paLines.map((line) => ({ id: `pa-${line.child_item_id}`, testId: `shipping-final-line-pa-${line.child_item_id}`, itemId: line.child_item_id, quantity: line.quantity * requestQuantity, unit: line.unit || "EA" }));
  const pfRows = [
    ...(newPaName ? [{ id: "new-pa", testId: "shipping-final-new-pa-link", itemName: newPaName, code: newPaCode ?? "-", quantity: requestQuantity, unit: "EA" }] : []),
    ...pfLines.map((line) => ({ id: `pf-${line.child_item_id}`, testId: `shipping-final-line-pf-${line.child_item_id}`, itemId: line.child_item_id, quantity: line.quantity * requestQuantity, unit: line.unit || "EA" })),
  ];
  const companionRows = companionLines.map((line) => ({ id: `companion-${line.item_id}`, testId: `shipping-final-line-companion-${line.item_id}`, itemId: line.item_id, quantity: line.quantity, unit: line.unit || "EA" }));
  const groups = [
    { id: "pa", testId: "shipping-final-group-pa", title: paTitle, code: paCode, tone: processTypeColor("PA"), rows: paRows },
    { id: "pf", testId: "shipping-final-group-pf", title: pfTitle, code: pfCode, tone: processTypeColor("PF"), rows: pfRows },
    { id: "companion", testId: "shipping-final-group-companion", title: "카톤·동반 출하품", tone: LEGACY_COLORS.purple, rows: companionRows },
  ];
  return (
    <section data-testid="shipping-final-requirements" className={`${SHIPPING_PANEL_CLASS} h-full min-h-0`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-1.5 text-sm font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>BOM·동반 출하품</div>
      <div data-testid="shipping-final-requirements-list" className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
        {groups.map((group) => (
          <FinalRequirementGroup key={group.id} group={group} itemById={itemById} />
        ))}
      </div>
    </section>
  );
}

function FinalRequirementGroup({
  group,
  itemById,
}: {
  group: { id: string; testId: string; title: string; code?: string; tone: string; rows: FinalRequirementRow[] };
  itemById: Map<string, Item>;
}) {
  return (
    <section data-testid={group.testId} className="flex min-h-0 flex-col rounded-[12px] border p-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      <div data-testid={`shipping-final-group-title-${group.id}`} className="mb-2 flex min-w-0 items-center justify-between gap-2" style={{ color: group.tone }}>
        <span className="min-w-0 truncate text-sm font-black">{group.title}</span>
        {group.code && (
          <span data-testid={`shipping-final-group-code-${group.id}`} className="flex shrink-0 items-center whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            <SummaryCode code={group.code} testId={`shipping-final-group-code-value-${group.id}`} />
          </span>
        )}
      </div>
      <div data-testid={`shipping-final-group-list-${group.id}`} className={SHIPPING_SCROLL_LIST_CLASS}>
        {group.rows.length === 0 ? (
          <div className={SHIPPING_EMPTY_BOX_CLASS} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>표시할 항목 없음</div>
        ) : group.rows.map((row) => {
          const item = row.itemId ? itemById.get(row.itemId) : undefined;
          const itemName = row.itemName ?? item?.item_name ?? "품목 없음";
          const itemCode = row.code ?? item?.mes_code ?? "코드 없음";
          return (
            <div key={row.id} data-testid={row.testId} className={`${SHIPPING_CELL_CLASS} flex min-w-0 items-center justify-between gap-2`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>{itemName}</div>
                <div data-testid={`shipping-final-code-meta-${row.id}`} className="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  <SummaryCode code={itemCode} testId={`shipping-final-code-${row.id}`} />
                </div>
              </div>
              <span data-testid={`shipping-final-quantity-${row.id}`} className="shrink-0 self-center text-xs font-bold tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>총 {row.quantity} {row.unit}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShippingShipmentHero({ name, code }: { name: string; code: string }) {
  return (
    <section data-testid="shipping-shipment-hero" className="rounded-[16px] border px-4 py-2" style={{ background: tint(LEGACY_COLORS.blue, 8), borderColor: tint(LEGACY_COLORS.blue, 34) }}>
      <div data-testid="shipping-shipment-hero-row" className="flex min-w-0 items-center gap-3">
        <div className="contents">
          <div className="shrink-0 text-xs font-black" style={{ color: LEGACY_COLORS.blue }}>출하 품목</div>
          <div data-testid="shipping-shipment-name" className="min-w-0 max-w-[42%] shrink truncate text-lg font-black leading-snug" title={name} style={{ color: LEGACY_COLORS.text }}>{name}</div>
          <div data-testid="shipping-shipment-code-meta" className="flex min-w-0 items-center gap-1 whitespace-nowrap text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            <SummaryCode code={code} testId="shipping-shipment-code" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ShippingRequestMemoCard({ requester, notes }: { requester: string; notes: string }) {
  const memo = notes.trim();
  return (
    <div data-testid="shipping-final-request-summary" className="grid min-w-0 gap-2 text-left md:grid-cols-[minmax(112px,0.45fr)_minmax(0,1fr)] md:items-center">
      <div className="min-w-0">
        <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>요청자</div>
        <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{requester}</div>
      </div>
      <div className="min-w-0 border-y py-2 md:border-x md:border-y-0 md:px-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>메모</div>
        <div className="line-clamp-2 whitespace-pre-wrap text-sm font-bold" style={{ color: memo ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
          {memo || "입력된 메모 없음"}
        </div>
      </div>
    </div>
  );
}

function WorkStep({ number, title, body, children, dataTestId, showHeader = true }: { number: number; title: string; body: string; children: ReactNode; dataTestId?: string; showHeader?: boolean }) {
  return (
    <section data-testid={dataTestId} className="flex h-full min-h-0 flex-col">
      {showHeader && (
        <div className="mb-3 flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-black" style={{ background: tint(LEGACY_COLORS.blue, 16), color: LEGACY_COLORS.blue }}>
            {number}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>{number + ". " + title}</div>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
          </div>
        </div>
      )}
      <div className={SHIPPING_FLEX_COL_CLASS}>{children}</div>
    </section>
  );
}

function ListColumn({ icon: Icon, title, subtitle, children, bodyDataTestId, action }: { icon: typeof PackageCheck; title: string; subtitle: string; children: ReactNode; bodyDataTestId?: string; action?: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <PanelTitle icon={Icon} title={title} subtitle={subtitle} />
        {action}
      </div>
      <div data-testid={bodyDataTestId} className="mt-3 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}


function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[136px] flex-col items-center justify-center rounded-[14px] border px-4 py-6 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
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

function CompactSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="mt-0.5 truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{value}</div>
    </div>
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
  dataTestId,
}: {
  icon: typeof PackageCheck;
  label: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  dataAction?: string;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      data-primary-action={dataAction}
      data-testid={dataTestId}
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
  dataTestId,
}: {
  icon: typeof PackageCheck;
  label: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] border font-black transition-opacity disabled:opacity-45 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
      style={{ background: tint(tone, 12), borderColor: tint(tone, 45), color: tone }}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </button>
  );
}const SHIPPING_ICON_BOX_CLASS = "flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border";
const SHIPPING_PANEL_CLASS = "flex min-h-0 flex-col rounded-[14px] border p-3";
const SHIPPING_TEXT_INPUT_CLASS = "h-12 w-full min-w-0 rounded-[12px] border px-3 text-sm font-bold outline-none focus-visible:ring-2";
const SHIPPING_SCROLL_LIST_CLASS = "grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1";
const SHIPPING_EMPTY_BOX_CLASS = "flex min-h-[88px] items-center justify-center rounded-[12px] border text-xs font-bold";
const SHIPPING_QTY_INPUT_CLASS = "min-h-9 h-full w-full rounded-[9px] border px-2 text-center text-sm font-black outline-none";
const SHIPPING_FLEX_COL_CLASS = "flex min-h-0 flex-1 flex-col";
const SHIPPING_ROW_CLASS = "flex min-w-0 items-center gap-3";
const SHIPPING_TOP_ROW_CLASS = "flex flex-wrap items-start justify-between gap-3";
const SHIPPING_CELL_CLASS = "rounded-[12px] border px-3 py-2";
const SHIPPING_MODAL_BODY_CLASS = "mt-4 flex min-h-0 flex-1 rounded-[18px] border p-3";
