"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, type Item, type ShippingBomMatchResponse, type ShippingFinalizationMode, type ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  buildShippingPayload, isValidPositiveInt, lineKey, requestBomLines,
  requestCompanionDraft, sortShippingDraftLines, validateShippingFinalization,
  type CompanionDraftLine, type DraftLine,
} from "@/lib/shipping/request-draft";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import type { Operator } from "../../login/useCurrentOperator";
import { InlineSearch, PrimaryActionButton, StickyFooter } from "../primitives";
import { ShippingAccordion, ShippingHeader, ShippingItemName } from "./ShippingPresentation";

type Step = 1 | 2 | 3 | 4 | 5;
type AddStage = "PA" | "PF" | "COMPANION";
type Draft = {
  basePfId: string;
  invoiceNumber: string;
  requestQuantity: string;
  requestedBy: string;
  notes: string;
  customPaName: string;
  customPfName: string;
  finalizationMode: ShippingFinalizationMode;
  reusePfItemId: string | null;
  lines: DraftLine[];
  companions: CompanionDraftLine[];
};

export interface MobileShippingRequestWizardProps {
  operator: Operator | null;
  request: ShippingRequest | null;
  step: Step;
  onStepChange: (step: Step) => void;
  onSaved: (request: ShippingRequest) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

const STEPS = [
  { key: "pf", label: "기준 PF" }, { key: "bom", label: "BOM 구성" },
  { key: "match", label: "BOM 매칭" }, { key: "info", label: "요청 정보" },
  { key: "review", label: "최종 확인" },
];
const CARD = { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border };
const INPUT = "h-12 w-full rounded-[12px] border px-3 text-base font-medium outline-none focus-visible:ring-2";
const BUTTON = "min-h-11 rounded-[12px] border px-4 text-sm font-bold transition active:scale-[0.98] disabled:opacity-45";

function initialDraft(request: ShippingRequest | null, operator: Operator | null): Draft {
  return {
    basePfId: request?.base_pf_item_id ?? "",
    invoiceNumber: request?.invoice_number ?? "",
    requestQuantity: String(request?.request_quantity ?? 1),
    requestedBy: request?.requested_by_name ?? operator?.name ?? "",
    notes: request?.notes ?? "",
    customPaName: request?.custom_pa_name ?? "",
    customPfName: request?.custom_pf_name ?? "",
    finalizationMode: request?.finalization_mode ?? "KEEP_BASE",
    reusePfItemId: request?.reuse_pf_item_id ?? null,
    lines: request ? requestBomLines(request) : [],
    companions: request ? requestCompanionDraft(request) : [],
  };
}

function signature(draft: Draft): string {
  return JSON.stringify({
    basePfId: draft.basePfId, invoiceNumber: draft.invoiceNumber,
    requestQuantity: draft.requestQuantity, requestedBy: draft.requestedBy,
    notes: draft.notes, customPaName: draft.customPaName, customPfName: draft.customPfName,
    finalizationMode: draft.finalizationMode, reusePfItemId: draft.reusePfItemId,
    lines: draft.lines.map(({ key: _key, ...line }) => line).sort((a, b) =>
      `${a.parent_stage}:${a.child_item_id}`.localeCompare(`${b.parent_stage}:${b.child_item_id}`)),
    companions: draft.companions.map(({ key: _key, ...line }) => line).sort((a, b) => a.item_id.localeCompare(b.item_id)),
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-[20px] border p-4 shadow-[var(--c-card-shadow)]" style={CARD}>
    <h3 className="mb-3 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{title}</h3>{children}
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
    <span className="mb-1.5 block">{label}</span>{children}
  </label>;
}

export function MobileShippingRequestWizard({ operator, request, step, onStepChange, onSaved, onCancel, onDirtyChange, onBusyChange }: MobileShippingRequestWizardProps) {
  const [draft, setDraft] = useState(() => initialDraft(request, operator));
  const [baseline, setBaseline] = useState(() => signature(initialDraft(request, operator)));
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pending, setPending] = useState<"bom" | "match" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pfQuery, setPfQuery] = useState("");
  const [pfSheetOpen, setPfSheetOpen] = useState(false);
  const [addStage, setAddStage] = useState<AddStage | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [match, setMatch] = useState<{ signature: string; result: ShippingBomMatchResponse } | null>(null);
  const requestIdRef = useRef(request?.request_id ?? null);
  const referenceQuantitiesRef = useRef(new Map(request?.bom_lines.map((line) => [line.line_id, line.quantity]) ?? []));
  const generationRef = useRef(0);
  const matchGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const currentSignatureRef = useRef("");
  const matchInputRef = useRef<{ basePfId: string; lines: DraftLine[]; bomLines: NonNullable<ReturnType<typeof buildShippingPayload>["bom_lines"]> }>({ basePfId: "", lines: [], bomLines: [] });
  const latestStatusRef = useRef(request?.status);
  const mountedRef = useRef(true);
  latestStatusRef.current = request?.status;

  // A refreshed list row for the same request must not replace unsaved input.
  useEffect(() => {
    const nextId = request?.request_id ?? null;
    if (requestIdRef.current === nextId) return;
    requestIdRef.current = nextId;
    referenceQuantitiesRef.current = new Map(request?.bom_lines.map((line) => [line.line_id, line.quantity]) ?? []);
    generationRef.current += 1;
    matchGenerationRef.current += 1;
    const next = initialDraft(request, operator);
    setDraft(next);
    setBaseline(signature(next));
    setMatch(null);
    setError(null);
    // Identity alone controls draft replacement; polling updates have the same id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.request_id]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void api.getItems({ limit: 2000 }).then((items) => {
      if (active) { setCatalog(items.filter((item) => !item.deleted_at)); setCatalogError(null); }
    }).catch((cause: unknown) => {
      if (active) setCatalogError(cause instanceof Error ? cause.message : "품목 목록을 불러오지 못했습니다.");
    }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; mountedRef.current = false; generationRef.current += 1; matchGenerationRef.current += 1; };
  }, []);

  const itemById = useMemo(() => new Map(catalog.map((item) => [item.item_id, item])), [catalog]);
  const draftSignature = signature(draft);
  const dirty = draftSignature !== baseline;
  const locked = Boolean(request && request.status !== "PREPARING");
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(pending === "save"); }, [pending, onBusyChange]);
  useRegisterDirty("mobile-shipping-wizard", dirty, () => {}, undefined, { mode: "confirm-only" });

  useEffect(() => {
    if (step > 1 && !draft.basePfId) onStepChange(1);
  }, [step, draft.basePfId, onStepChange]);

  const payload = useMemo(() => buildShippingPayload({
    requestQuantity: draft.requestQuantity, invoiceNumber: draft.invoiceNumber,
    requestedBy: draft.requestedBy, operatorName: operator?.name,
    isEditing: Boolean(requestIdRef.current), customPaName: draft.customPaName,
    customPfName: draft.customPfName, notes: draft.notes,
    finalizationMode: draft.finalizationMode, reusePfItemId: draft.reusePfItemId,
    companionDraft: draft.companions, draftLines: draft.lines, itemById,
  }), [draft, itemById, operator?.name]);
  const bomSignature = JSON.stringify([draft.basePfId, payload.bom_lines]);
  currentSignatureRef.current = bomSignature;
  matchInputRef.current = { basePfId: draft.basePfId, lines: draft.lines, bomLines: payload.bom_lines };
  const matchStale = match?.signature !== bomSignature;
  const matchResult = matchStale ? null : match.result;

  const requestMatch = useCallback(async (expectedSignature: string): Promise<ShippingBomMatchResponse | null> => {
    const input = matchInputRef.current;
    if (!input.basePfId || input.lines.some((line) => !isValidPositiveInt(line.quantity))) return null;
    const generation = ++matchGenerationRef.current;
    setPending("match");
    setError(null);
    try {
      const result = await api.matchShippingBom({ base_pf_item_id: input.basePfId, bom_lines: input.bomLines });
      if (!mountedRef.current || generation !== matchGenerationRef.current || expectedSignature !== currentSignatureRef.current) return null;
      setMatch({ signature: expectedSignature, result });
      setDraft((current) => ({ ...current,
        finalizationMode: result.base_pf_matches ? "KEEP_BASE" : current.finalizationMode === "KEEP_BASE" ? "CREATE_NEW" : current.finalizationMode,
        reusePfItemId: result.base_pf_matches ? null : current.reusePfItemId,
      }));
      return result;
    } catch (cause) {
      if (mountedRef.current && generation === matchGenerationRef.current) setError(cause instanceof Error ? cause.message : "동일 BOM 확인에 실패했습니다.");
      return null;
    } finally {
      if (mountedRef.current && generation === matchGenerationRef.current) setPending(null);
    }
  }, []);

  useEffect(() => {
    if (step < 3 || !draft.basePfId || !matchStale || draft.lines.some((line) => !isValidPositiveInt(line.quantity))) return;
    const timer = window.setTimeout(() => { void requestMatch(bomSignature); }, 250);
    return () => {
      window.clearTimeout(timer);
      matchGenerationRef.current += 1;
      if (mountedRef.current) setPending((current) => current === "match" ? null : current);
    };
  }, [step, bomSignature, matchStale, draft.basePfId, draft.lines, requestMatch]);

  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };
  const changePf = async (itemId: string) => {
    if (requestIdRef.current || pending || itemId === draft.basePfId) return;
    const generation = ++generationRef.current;
    setPending("bom"); setError(null);
    try {
      const source = catalog.length ? catalog : await api.getItems({ limit: 2000 });
      const byId = new Map(source.map((item) => [item.item_id, item]));
      const pfRows = await api.getBOM(itemId);
      const nextLines: DraftLine[] = pfRows.map((row) => ({ key: row.bom_id, parent_stage: "PF", child_item_id: row.child_item_id, quantity: row.quantity, unit: row.unit, included: true, origin: "DEFAULT" }));
      const paChild = pfRows.map((row) => byId.get(row.child_item_id)).find((item) => item?.process_type_code === "PA");
      if (paChild) {
        const paRows = await api.getBOM(paChild.item_id);
        nextLines.push(...paRows.map((row) => ({ key: row.bom_id, parent_stage: "PA" as const, child_item_id: row.child_item_id, quantity: row.quantity, unit: row.unit, included: true, origin: "DEFAULT" as const })));
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      referenceQuantitiesRef.current = new Map(nextLines.map((line) => [line.key, line.quantity]));
      setCatalog(source.filter((item) => !item.deleted_at));
      setDraft((current) => ({ ...current, basePfId: itemId, lines: nextLines, finalizationMode: "KEEP_BASE", reusePfItemId: null, customPaName: "", customPfName: "" }));
      setMatch(null);
      setPfSheetOpen(false);
    } catch (cause) {
      if (mountedRef.current && generation === generationRef.current) setError(cause instanceof Error ? cause.message : "기본 BOM을 불러오지 못했습니다.");
    } finally {
      if (mountedRef.current && generation === generationRef.current) setPending(null);
    }
  };

  const changeLine = (key: string, patch: Partial<DraftLine>) => {
    update({ lines: draft.lines.map((line) => line.key === key ? { ...line, ...patch } : line) });
    matchGenerationRef.current += 1;
  };
  const removeLine = (key: string) => { update({ lines: draft.lines.filter((line) => line.key !== key) }); matchGenerationRef.current += 1; };
  const addItem = (item: Item) => {
    if (!addStage) return;
    if (addStage === "COMPANION") {
      const existing = draft.companions.find((line) => line.item_id === item.item_id);
      update({ companions: existing
        ? draft.companions.map((line) => line.item_id === item.item_id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...draft.companions, { key: lineKey(), item_id: item.item_id, quantity: 1, unit: item.unit || "EA" }] });
    } else {
      const existing = draft.lines.find((line) => line.parent_stage === addStage && line.child_item_id === item.item_id);
      update({ lines: existing
        ? draft.lines.map((line) => line.key === existing.key ? { ...line, quantity: line.quantity + 1, included: true } : line)
        : [...draft.lines, { key: lineKey(), parent_stage: addStage, child_item_id: item.item_id, quantity: 1, unit: item.unit || "EA", included: true, origin: "CUSTOM" }] });
      matchGenerationRef.current += 1;
    }
    setAddStage(null); setAddQuery("");
  };

  const validationError = () => {
    if (!draft.basePfId) return "기준 PF를 먼저 선택하세요.";
    if (!isValidPositiveInt(draft.requestQuantity)) return "출하 수량은 1 이상의 정수여야 합니다.";
    if (draft.lines.some((line) => !isValidPositiveInt(line.quantity)) || draft.companions.some((line) => !isValidPositiveInt(line.quantity))) return "구성품 수량은 1 이상의 정수여야 합니다.";
    if (pending === "bom") return "기본 BOM을 불러오는 중입니다.";
    return null;
  };
  const newNameError = (result: ShippingBomMatchResponse, mode: ShippingFinalizationMode) => {
    if (mode !== "CREATE_NEW") return null;
    const basePfName = itemById.get(draft.basePfId)?.item_name?.trim() ?? request?.base_pf_item_name?.trim() ?? "";
    const paLine = draft.lines.find((line) => line.parent_stage === "PF" && itemById.get(line.child_item_id)?.process_type_code === "PA");
    const basePaName = paLine ? itemById.get(paLine.child_item_id)?.item_name?.trim() ?? "" : "";
    if (!result.base_pf_matches && draft.customPaName.trim() === basePaName) return "새 PA 품명을 기존 품명과 다르게 입력하세요.";
    if (!result.base_pf_matches && draft.customPfName.trim() === basePfName) return "새 PF 품명을 기존 품명과 다르게 입력하세요.";
    return null;
  };
  const next = () => {
    if (locked) return;
    const issue = validationError();
    if (issue) { setError(issue); return; }
    if (step === 3) {
      if (!matchResult) { setError("BOM 매칭을 완료한 뒤 다음 단계로 이동하세요."); return; }
      const check = validateShippingFinalization({ matchResult, finalizationMode: draft.finalizationMode, reusePfItemId: draft.reusePfItemId, customPaName: draft.customPaName, customPfName: draft.customPfName });
      const nameIssue = newNameError(matchResult, check.mode);
      if (check.error || nameIssue) { setError(check.error ?? nameIssue); return; }
    }
    if (step < 5) onStepChange((step + 1) as Step);
  };

  const save = async () => {
    if (savingRef.current || pending) return;
    if (latestStatusRef.current && latestStatusRef.current !== "PREPARING") { setError("준비 완료된 요청은 수정할 수 없습니다."); return; }
    const issue = validationError();
    if (issue) { setError(issue); return; }
    const generation = generationRef.current;
    const expectedSignature = bomSignature;
    savingRef.current = true; setPending("save"); setError(null);
    try {
      // The final decision always uses a fresh match for exactly the submitted BOM.
      const result = await api.matchShippingBom({ base_pf_item_id: draft.basePfId, bom_lines: payload.bom_lines ?? [] });
      if (!mountedRef.current || generation !== generationRef.current || expectedSignature !== currentSignatureRef.current) return;
      if (latestStatusRef.current && latestStatusRef.current !== "PREPARING") { setError("준비 완료된 요청은 수정할 수 없습니다."); return; }
      setMatch({ signature: expectedSignature, result });
      const freshMode = !result.base_pf_matches && draft.finalizationMode === "KEEP_BASE" ? "CREATE_NEW" : draft.finalizationMode;
      if (freshMode !== draft.finalizationMode || result.base_pf_matches) {
        setDraft((current) => ({ ...current, finalizationMode: result.base_pf_matches ? "KEEP_BASE" : freshMode, reusePfItemId: result.base_pf_matches ? null : current.reusePfItemId }));
      }
      const check = validateShippingFinalization({ matchResult: result, finalizationMode: freshMode, reusePfItemId: draft.reusePfItemId, customPaName: draft.customPaName, customPfName: draft.customPfName });
      const nameIssue = newNameError(result, check.mode);
      if (check.error || nameIssue) { setError(check.error ?? nameIssue); onStepChange(3); return; }
      const finalPayload = { ...payload, finalization_mode: check.mode, reuse_pf_item_id: check.mode === "REUSE_CANDIDATE" ? draft.reusePfItemId : null };
      const saved = requestIdRef.current
        ? await api.updateShippingRequest(requestIdRef.current, finalPayload)
        : await api.createShippingRequest({ base_pf_item_id: draft.basePfId, ...finalPayload });
      if (!mountedRef.current || generation !== generationRef.current || expectedSignature !== currentSignatureRef.current) return;
      requestIdRef.current = saved.request_id;
      setBaseline(signature({ ...draft, finalizationMode: check.mode, reusePfItemId: check.mode === "REUSE_CANDIDATE" ? draft.reusePfItemId : null }));
      onDirtyChange?.(false);
      onSaved(saved);
    } catch (cause) {
      if (mountedRef.current && generation === generationRef.current) setError(cause instanceof Error ? cause.message : "출하 요청 저장에 실패했습니다.");
    } finally {
      savingRef.current = false;
      if (mountedRef.current && generation === generationRef.current) setPending(null);
    }
  };

  const pfOptions = catalog.filter((item) => item.process_type_code === "PF" && `${item.item_name} ${item.mes_code ?? ""}`.toLowerCase().includes(pfQuery.toLowerCase())).slice(0, 80);
  const addOptions = catalog.filter((item) => `${item.item_name} ${item.mes_code ?? ""}`.toLowerCase().includes(addQuery.toLowerCase())).slice(0, 60);
  const sortedLines = sortShippingDraftLines(draft.lines, itemById);
  const changedLines = sortedLines.filter((line) => line.origin === "CUSTOM" || !line.included || (referenceQuantitiesRef.current.has(line.key) && line.quantity !== referenceQuantitiesRef.current.get(line.key)));
  /** 원래 BOM 수량을 기준으로 변경 종류를 표시한다. */
  const changeLabel = (line: DraftLine): string => {
    if (!line.included) return "제외";
    if (line.origin === "CUSTOM") return "추가";
    const before = referenceQuantitiesRef.current.get(line.key);
    return before === undefined ? "변경" : `수량 변경 · ${before} → ${line.quantity}`;
  };
  const basePfName = itemById.get(draft.basePfId)?.item_name ?? request?.base_pf_item_name ?? "기준 PF 미선택";
  const selectedCandidate = matchResult?.pf_candidates?.find((candidate) => candidate.pf_item_id === draft.reusePfItemId);
  const displayPfName = selectedCandidate?.pf_item_name ?? (draft.finalizationMode === "CREATE_NEW" && !matchResult?.base_pf_matches ? draft.customPfName || "새 PF 품명 미입력" : basePfName);
  const basePaLine = draft.lines.find((line) => line.parent_stage === "PF" && itemById.get(line.child_item_id)?.process_type_code === "PA");
  const basePa = basePaLine ? itemById.get(basePaLine.child_item_id) : undefined;
  const displayPaName = selectedCandidate?.pa_item_name ?? (draft.finalizationMode === "CREATE_NEW" && !matchResult?.base_pf_matches ? draft.customPaName || "새 PA 품명 미입력" : basePa?.item_name ?? request?.final_pa_item_name ?? "PA 없음");
  const displayPfCode = selectedCandidate?.pf_mes_code ?? (draft.finalizationMode === "CREATE_NEW" ? matchResult?.preview_pf_mes_code : itemById.get(draft.basePfId)?.mes_code ?? request?.base_pf_mes_code);
  const displayPaCode = selectedCandidate?.pa_mes_code ?? (draft.finalizationMode === "CREATE_NEW" ? matchResult?.preview_pa_mes_code : basePa?.mes_code ?? request?.final_pa_mes_code);

  return <div data-testid="mobile-shipping-wizard" className="flex h-full min-h-0 min-w-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
    <ShippingHeader title={STEPS[step - 1].label} subtitle={request ? "출하 요청 수정" : "출하 요청 작성"} onBack={onCancel} backLabel="출하 요청 닫기" disabled={pending === "save"} progress={{ steps: STEPS, current: step - 1 }} />
    <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-5" data-testid={`mobile-shipping-step-${step}`}>
      {locked && <div role="alert" className="rounded-[12px] border p-3 text-sm font-bold" style={{ background: LEGACY_COLORS.warningBg, borderColor: LEGACY_COLORS.yellow, color: LEGACY_COLORS.text }}>준비 완료된 요청은 수정할 수 없습니다. 작성 중인 입력은 화면에 보존됩니다.</div>}
      {error && <div role="alert" className="rounded-[12px] border p-3 text-sm font-bold" style={{ background: LEGACY_COLORS.errorBg, borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}>{error}</div>}
      <fieldset disabled={pending === "save"} className="min-w-0 space-y-3">
      {step === 1 && <>
        <Section title="출하 정보">
          <div className="space-y-3">
            <Field label="인보이스 번호"><input aria-label="인보이스 번호" className={INPUT} style={CARD} value={draft.invoiceNumber} disabled={locked} onChange={(event) => update({ invoiceNumber: event.target.value })} placeholder="인보이스 번호 입력" /></Field>
            <Field label="출하 수량"><input aria-label="출하 수량" type="number" min="1" step="1" inputMode="numeric" className={INPUT} style={CARD} value={draft.requestQuantity} disabled={locked} onChange={(event) => update({ requestQuantity: event.target.value })} /></Field>
          </div>
        </Section>
        <Section title="기준 PF">
          {draft.basePfId ? <div className="mb-3 rounded-[12px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}><ShippingItemName name={basePfName} className="text-sm font-bold" /><p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{itemById.get(draft.basePfId)?.mes_code ?? request?.base_pf_mes_code ?? "코드 없음"}</p></div>
            : <p className="mb-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>출하할 PF를 선택하세요.</p>}
          <button type="button" onClick={() => setPfSheetOpen(true)} disabled={locked || Boolean(requestIdRef.current) || pending !== null} className={`${BUTTON} w-full`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>{draft.basePfId ? "기준 PF 변경" : "기준 PF 선택"}</button>
        </Section>
      </>}
      {step === 2 && <>
        {(["PA", "PF", "COMPANION"] as const).map((stage) => {
          const title = stage === "COMPANION" ? "동반 출하품" : `${stage} 구성품`;
          const lines = stage === "COMPANION" ? draft.companions : sortedLines.filter((line) => line.parent_stage === stage);
          return <ShippingAccordion key={stage} title={title} summary={`${lines.length}개`} defaultOpen={stage === "PA"}>
            <div>{lines.map((line) => {
              const item = itemById.get(stage === "COMPANION" ? (line as CompanionDraftLine).item_id : (line as DraftLine).child_item_id);
              const isBom = stage !== "COMPANION";
              const bomLine = isBom ? line as DraftLine : null;
              const itemName = item?.item_name ?? (stage === "COMPANION" ? (request?.companion_lines.find((row) => row.item_id === (line as CompanionDraftLine).item_id)?.item_name ?? "품목") : (request?.bom_lines.find((row) => row.child_item_id === bomLine?.child_item_id)?.item_name ?? "품목"));
              return <div key={line.key} className="border-b py-3 last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                <ShippingItemName name={itemName} className="text-sm font-bold" />
                <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item?.mes_code ?? "코드 없음"} · {line.unit || "EA"}{bomLine ? ` · ${bomLine.origin === "CUSTOM" ? "추가" : "기본"}` : ""}</p>
                <div className="mt-2 flex items-end gap-2">{(!bomLine || bomLine.included) && <div className="min-w-0 flex-1"><Field label="수량"><input type="number" min="1" step="1" inputMode="numeric" aria-label={`${itemName} 수량`} className={INPUT} style={CARD} value={line.quantity} disabled={locked} onChange={(event) => {
                  const quantity = Number(event.target.value);
                  if (bomLine) changeLine(line.key, { quantity });
                  else update({ companions: draft.companions.map((row) => row.key === line.key ? { ...row, quantity } : row) });
                }} /></Field></div>}
                  {bomLine ? <button type="button" aria-label={`${itemName} ${bomLine.origin === "CUSTOM" ? "삭제" : bomLine.included ? "제외" : "복원"}`} disabled={locked} onClick={() => bomLine.origin === "CUSTOM" ? removeLine(line.key) : changeLine(line.key, { included: !bomLine.included })} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border disabled:opacity-45" style={CARD}>{bomLine.included ? <Trash2 size={20} /> : <RotateCcw size={20} />}</button>
                    : <button type="button" aria-label={`${itemName} 삭제`} disabled={locked} onClick={() => update({ companions: draft.companions.filter((row) => row.key !== line.key) })} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border disabled:opacity-45" style={CARD}><Trash2 size={20} /></button>}
                </div>
                {bomLine && !bomLine.included && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>출하 구성에서 제외됨</p>}
              </div>;
            })}
              {lines.length === 0 && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 품목이 없습니다.</p>}
              <button type="button" disabled={locked} onClick={() => { setAddStage(stage); setAddQuery(""); }} className={`${BUTTON} mt-3 flex w-full items-center justify-center gap-2`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}><Plus size={18} /> 품목 추가</button>
            </div>
          </ShippingAccordion>;
        })}
      </>}
      {step === 3 && <>
        <Section title="BOM 확인 결과">
          {matchStale ? <div className="space-y-2"><p className="text-sm">{pending === "match" ? "변경된 BOM을 확인 중입니다." : "변경된 BOM을 다시 확인해야 합니다."}</p><button type="button" onClick={() => void requestMatch(bomSignature)} disabled={locked || pending !== null} className={BUTTON} style={CARD}>다시 확인</button></div>
            : <div className="text-sm"><p className="rounded-[12px] p-3 font-bold" style={{ background: matchResult?.base_pf_matches ? LEGACY_COLORS.successBg : LEGACY_COLORS.warningBg }}>{matchResult?.base_pf_matches ? "기본 BOM과 일치합니다." : "기본 BOM과 다른 구성이 있습니다."}</p><div className="border-b py-3" style={{ borderColor: LEGACY_COLORS.border }}><p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>최종 PA</p><ShippingItemName name={displayPaName} className="text-sm font-bold" /><p className="break-all text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{displayPaCode ?? "저장 시 코드 확정"}</p></div><div className="py-3"><p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>최종 PF</p><ShippingItemName name={displayPfName} className="text-sm font-bold" /><p className="break-all text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{displayPfCode ?? "저장 시 코드 확정"}</p></div></div>}
        </Section>
        {matchResult && !matchResult.base_pf_matches && <Section title="최종 품목 결정">
          <p className="mb-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>같은 BOM이라도 국가·판매처가 다를 수 있습니다. 재사용할 PF를 확인하세요.</p>
          <div className="space-y-2">{(matchResult.pf_candidates ?? []).map((candidate) => <div key={candidate.pf_item_id} className="rounded-[12px] border p-2" style={{ background: LEGACY_COLORS.s2, borderColor: draft.reusePfItemId === candidate.pf_item_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}><ShippingItemName name={candidate.pf_item_name} className="px-2 text-sm font-bold" /><button type="button" aria-label={`${candidate.pf_item_name} 선택`} aria-pressed={draft.finalizationMode === "REUSE_CANDIDATE" && draft.reusePfItemId === candidate.pf_item_id} disabled={locked} onClick={() => update({ finalizationMode: "REUSE_CANDIDATE", reusePfItemId: candidate.pf_item_id })} className="mt-1 flex min-h-11 w-full items-center justify-between rounded-[12px] px-2 text-left text-sm disabled:opacity-45" style={{ color: LEGACY_COLORS.text }}><span className="min-w-0 break-all">{candidate.pf_mes_code ?? "코드 없음"} · PA {candidate.pa_item_name}</span><span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>{draft.reusePfItemId === candidate.pf_item_id ? "선택됨" : "선택"}</span></button></div>)}
            <button type="button" aria-pressed={draft.finalizationMode === "CREATE_NEW"} disabled={locked} onClick={() => update({ finalizationMode: "CREATE_NEW", reusePfItemId: null })} className={`${BUTTON} w-full text-left`} style={{ background: LEGACY_COLORS.s2, borderColor: draft.finalizationMode === "CREATE_NEW" ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>새 PA·PF로 생성</button>
          </div>
          {draft.finalizationMode === "CREATE_NEW" && <div className="mt-3 space-y-3"><Field label="새 PA 품명"><input aria-label="새 PA 품명" className={INPUT} style={CARD} value={draft.customPaName} disabled={locked} onChange={(event) => update({ customPaName: event.target.value })} /></Field><Field label="새 PF 품명"><input aria-label="새 PF 품명" className={INPUT} style={CARD} value={draft.customPfName} disabled={locked} onChange={(event) => update({ customPfName: event.target.value })} /></Field></div>}
        </Section>}
        {changedLines.length > 0 && <ShippingAccordion title="변경된 구성품" summary={`${changedLines.length}개`}><ul className="space-y-2 text-sm">{changedLines.map((line) => <li key={line.key}><ShippingItemName name={itemById.get(line.child_item_id)?.item_name ?? "품목"} /><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{changeLabel(line)}</span></li>)}</ul></ShippingAccordion>}
      </>}
      {step === 4 && <>
        <Section title="작업자"><p className="text-sm font-bold">{draft.requestedBy || "로그인 사용자 없음"}</p><p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{request ? "기존 요청자 유지" : "로그인 사용자 자동 반영"}</p></Section>
        <Section title="요청 메모"><Field label="출하 준비 참고사항"><textarea aria-label="요청 메모" className="min-h-36 w-full rounded-[12px] border p-3 text-base outline-none focus-visible:ring-2" style={CARD} value={draft.notes} disabled={locked} onChange={(event) => update({ notes: event.target.value })} placeholder="출하 준비자가 알아야 할 변경 사항" /></Field></Section>
      </>}
      {step === 5 && <>
        <Section title="출하 요청 최종 확인"><dl className="space-y-3 text-sm"><div><dt className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>최종 PF · 출하 수량</dt><dd className="flex items-start justify-between gap-2 font-bold"><ShippingItemName name={displayPfName} className="min-w-0 flex-1" /><span className="shrink-0 whitespace-nowrap">× {draft.requestQuantity}</span></dd><dd className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{displayPfCode ?? "저장 시 코드 확정"}</dd></div><div><dt className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>인보이스</dt><dd>{draft.invoiceNumber || "미입력"}</dd></div><div><dt className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>최종 PA</dt><dd><ShippingItemName name={displayPaName} /></dd></div><div><dt className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>요청자</dt><dd>{draft.requestedBy || "미입력"}</dd></div>{draft.notes && <div><dt className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>메모</dt><dd className="whitespace-pre-wrap">{draft.notes}</dd></div>}</dl></Section>
        <ShippingAccordion title="전체 BOM" summary={`${sortedLines.filter((line) => line.included).length + draft.companions.length}개`}>
          {(["PA", "PF"] as const).map((stage) => <div key={stage} className="mb-3"><h3 className="mb-2 text-sm font-bold">{stage} 구성품</h3><ul className="space-y-2 text-sm">{sortedLines.filter((line) => line.parent_stage === stage && line.included).map((line) => <li key={line.key} className="flex justify-between gap-2"><ShippingItemName name={itemById.get(line.child_item_id)?.item_name ?? request?.bom_lines.find((row) => row.child_item_id === line.child_item_id)?.item_name ?? "품목"} className="min-w-0 flex-1" /><span className="shrink-0 whitespace-nowrap">× {line.quantity * Number(draft.requestQuantity)}</span></li>)}</ul></div>)}
          <div><h3 className="mb-2 text-sm font-bold">동반 출하품</h3><ul className="space-y-2 text-sm">{draft.companions.map((line) => <li key={line.key} className="flex justify-between gap-2"><ShippingItemName name={itemById.get(line.item_id)?.item_name ?? request?.companion_lines.find((row) => row.item_id === line.item_id)?.item_name ?? "품목"} className="min-w-0 flex-1" /><span className="shrink-0 whitespace-nowrap">× {line.quantity}</span></li>)}</ul></div>
        </ShippingAccordion>
        {changedLines.length > 0 && <ShippingAccordion title="변경된 구성품" summary={`${changedLines.length}개`} defaultOpen><ul className="space-y-2 text-sm">{changedLines.map((line) => <li key={line.key}><ShippingItemName name={itemById.get(line.child_item_id)?.item_name ?? "품목"} /><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{changeLabel(line)}</span></li>)}</ul></ShippingAccordion>}
      </>}
      </fieldset>
    </main>
    <StickyFooter flat compact embedded className="shrink-0"><div className="flex gap-2">
      {step > 1 && <button type="button" onClick={() => onStepChange((step - 1) as Step)} disabled={pending !== null} className={BUTTON} style={CARD}>이전</button>}
      <PrimaryActionButton label={step < 5 ? "다음" : pending === "save" ? "저장 중..." : request ? "수정 저장" : "출하 요청 저장"} intent="primary" onClick={step < 5 ? next : () => void save()} disabled={locked || pending !== null} className="min-w-0 flex-1" />
    </div></StickyFooter>
    <BottomSheet open={pfSheetOpen && !locked} onClose={() => setPfSheetOpen(false)} title="기준 PF 선택">
      <div className="space-y-3 p-4"><InlineSearch ariaLabel="PF 검색" value={pfQuery} onChange={setPfQuery} placeholder="PF 코드 또는 품명" className="[&_input]:!text-base [&_button]:h-11 [&_button]:w-11" />
        {catalogLoading && <p className="text-sm">품목을 불러오는 중입니다.</p>}
        {catalogError && <p role="alert" className="text-sm" style={{ color: LEGACY_COLORS.red }}>{catalogError}</p>}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">{pfOptions.map((item) => <div key={item.item_id} className="rounded-[12px] border p-2" style={{ background: draft.basePfId === item.item_id ? LEGACY_COLORS.s3 : LEGACY_COLORS.s2, borderColor: draft.basePfId === item.item_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}><ShippingItemName name={item.item_name} className="px-2 text-sm font-bold" /><button type="button" onClick={() => void changePf(item.item_id)} disabled={Boolean(requestIdRef.current) || pending !== null} aria-label={`${item.item_name} 선택`} aria-pressed={draft.basePfId === item.item_id} className="flex min-h-11 w-full items-center justify-between rounded-[12px] px-2 text-left text-sm active:scale-[0.98] disabled:opacity-45"><span style={{ color: LEGACY_COLORS.muted2 }}>{item.mes_code ?? "코드 없음"}</span>{draft.basePfId === item.item_id ? <Check size={20} style={{ color: LEGACY_COLORS.blue }} /> : <span style={{ color: LEGACY_COLORS.blue }}>선택</span>}</button></div>)}</div>
        {!catalogLoading && pfOptions.length === 0 && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>선택 가능한 PF가 없습니다.</p>}
      </div>
    </BottomSheet>
    <BottomSheet open={addStage !== null && !locked} onClose={() => setAddStage(null)} title={`${addStage === "COMPANION" ? "동반 출하품" : `${addStage ?? ""} 구성품`} 추가`}>
      <div className="space-y-3 p-4"><InlineSearch ariaLabel="추가할 품목 검색" value={addQuery} onChange={setAddQuery} placeholder="품명 또는 코드 검색" className="[&_input]:!text-base [&_button]:h-11 [&_button]:w-11" /><div className="max-h-[50vh] space-y-2 overflow-y-auto">{addOptions.map((item) => <div key={item.item_id} className="rounded-[12px] border p-2" style={CARD}><ShippingItemName name={item.item_name} className="px-2 text-sm font-bold" /><button type="button" aria-label={`${item.item_name} 추가`} onClick={() => addItem(item)} className="flex min-h-11 w-full items-center justify-between rounded-[12px] px-2 text-left text-sm active:scale-[0.98]"><span style={{ color: LEGACY_COLORS.muted2 }}>{item.mes_code ?? "코드 없음"}</span><span style={{ color: LEGACY_COLORS.blue }}>추가</span></button></div>)}</div></div>
    </BottomSheet>
  </div>;
}
