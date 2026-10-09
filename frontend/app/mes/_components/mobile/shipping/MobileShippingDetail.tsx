"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { api, type Item, type ShippingRequest, type ShippingRequestRevisionChange } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { useShippingRevisionsQuery } from "@/lib/queries/useShippingQuery";
import { invalidateOperationalQueries } from "@/lib/queries/realtime";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import type { IoEntryIntent } from "../../_warehouse_v2/types";
import { PrimaryActionButton, StickyFooter } from "../primitives";
import presentation from "../mobilePresentation.module.css";
import { ShippingAccordion, ShippingHeader, ShippingItemName, ShippingStatus } from "./ShippingPresentation";

type Action = "prepare" | "pickup" | "prepareCancel" | "pickupCancel" | "delete" | "clear";

export interface MobileShippingDetailProps {
  request: ShippingRequest;
  onRequestChange: (request: ShippingRequest) => void;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: () => void;
  onPickupCancelled: (request: ShippingRequest) => void;
  onGoToWarehouse?: (item: Item, intent: IoEntryIntent) => void;
}

const ACTION_LABEL: Record<Action, string> = {
  prepare: "준비 완료", pickup: "픽업 완료", prepareCancel: "준비 완료 취소",
  pickupCancel: "픽업 취소", delete: "요청 취소", clear: "전체 해제",
};
const FIELD_LABEL: Record<string, string> = {
  request_quantity: "출하 수량", invoice_number: "인보이스 번호", custom_pa_name: "PA 품목명",
  custom_pf_name: "PF 품목명", notes: "메모", bom_lines: "BOM 구성", companion_lines: "동반 출하품",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "작업을 완료하지 못했습니다.";
}

function hasPreparedHistory(request: ShippingRequest): boolean {
  return Boolean(request.prepared_at) || request.status === "PREPARED" || request.status === "PICKED_UP"
    || request.events.some((event) => event.event_type === "PREPARED");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatKst(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((row) => row.type === type)?.value ?? "--";
  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")} KST`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <h2 className="mb-3 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{title}</h2>{children}
  </section>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 border-t py-2" style={{ borderColor: LEGACY_COLORS.border }}>
    <div className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
    <div className="mt-1 break-words text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>{value || "-"}</div>
  </div>;
}

function RevisionChange({ change }: { change: ShippingRequestRevisionChange }) {
  if (change.field === "bom_lines" || change.field === "companion_lines") {
    const lines = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
    const key = (line: Record<string, unknown>): string => `${line.parent_stage ?? "ITEM"}:${line.child_item_id ?? line.item_id ?? ""}`;
    const before = new Map(lines(change.before).map((line) => [key(line), line]));
    const after = new Map(lines(change.after).map((line) => [key(line), line]));
    const details: string[] = [];
    const compact = change.field === "bom_lines";
    for (const lineKey of new Set([...before.keys(), ...after.keys()])) {
      const previous = before.get(lineKey);
      const next = after.get(lineKey);
      const line = next ?? previous!;
      const name = `${line.parent_stage ? `[${line.parent_stage}] ` : ""}${line.item_name ?? line.mes_code ?? "품목"}${line.mes_code && line.item_name ? ` (${line.mes_code})` : ""}`;
      const quantity = (row: Record<string, unknown>) => `${row.quantity ?? "-"}${compact ? "" : " "}${row.unit ?? "EA"}`;
      if (!previous) details.push(`추가: ${name} · ${quantity(next!)}`);
      else if (!next) details.push(`삭제: ${name} · ${quantity(previous)}`);
      else {
        if (previous.quantity !== next.quantity) details.push(`수량 변경: ${name} · ${quantity(previous)} → ${quantity(next)}`);
        if (previous.included !== next.included) details.push(`포함 상태 변경: ${name} · ${previous.included ? "포함" : "제외"} → ${next.included ? "포함" : "제외"}`);
      }
    }
    return <li className="break-words text-sm" style={{ color: LEGACY_COLORS.muted2 }}><strong style={{ color: LEGACY_COLORS.text }}>{FIELD_LABEL[change.field]}</strong><ul>{(details.length ? details : ["구성 순서가 변경되었습니다."]).map((detail) => <li key={detail}>{detail}</li>)}</ul></li>;
  }
  const describe = (value: unknown): string => {
    if (Array.isArray(value)) return value.map((row) => {
      if (!row || typeof row !== "object") return String(row);
      const line = row as Record<string, unknown>;
      return `${line.parent_stage ? `[${line.parent_stage}] ` : ""}${line.item_name ?? line.mes_code ?? line.item_id ?? line.child_item_id ?? "품목"} ${line.quantity ?? ""}${line.unit ?? ""}${line.included === false ? " (제외)" : ""}`;
    }).join(", ") || "없음";
    return value === null || value === undefined || value === "" ? "없음" : String(value);
  };
  return <li className="break-words text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
    <strong style={{ color: LEGACY_COLORS.text }}>{FIELD_LABEL[change.field] ?? change.field}</strong>: {change.field === "request_quantity" ? `${describe(change.before)}대 → ${describe(change.after)}대` : `${describe(change.before)} → ${describe(change.after)}`}
  </li>;
}

export function MobileShippingDetail({ request, onRequestChange, onEdit, onBack, onDeleted, onPickupCancelled, onGoToWarehouse }: MobileShippingDetailProps) {
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState(request.invoice_number ?? "");
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [serial, setSerial] = useState(request.serial_numbers ?? "");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortagePending, setShortagePending] = useState(false);
  const busyRef = useRef(false);
  const shortagePendingRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const priorRequestId = useRef(request.request_id);
  const priorInvoice = useRef(request.invoice_number ?? "");
  const invoiceDirty = invoice.trim() !== (request.invoice_number ?? "");
  const cannotClearInvoice = hasPreparedHistory(request) && Boolean(request.invoice_number?.trim()) && !invoice.trim();
  const revisions = useShippingRevisionsQuery(request.request_id);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, []);
  useEffect(() => {
    if (priorRequestId.current !== request.request_id) {
      priorRequestId.current = request.request_id;
      generationRef.current += 1;
      setInvoice(request.invoice_number ?? "");
      setEditingInvoice(false);
      priorInvoice.current = request.invoice_number ?? "";
      setSerial(request.serial_numbers ?? "");
      setInvoiceError(null);
      setActionError(null);
      setConfirm(null);
      setMenuOpen(false);
    } else if (priorInvoice.current !== (request.invoice_number ?? "")) {
      if (invoice.trim() === priorInvoice.current) setInvoice(request.invoice_number ?? "");
      priorInvoice.current = request.invoice_number ?? "";
    }
  }, [request.request_id, request.invoice_number, request.serial_numbers, invoice]);

  async function runMutation(work: () => Promise<ShippingRequest>, onSuccess: (next: ShippingRequest) => void = onRequestChange): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    const generation = generationRef.current;
    try {
      const next = await work();
      if (!mountedRef.current || generation !== generationRef.current) return;
      onSuccess(next);
      void invalidateOperationalQueries(queryClient);
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) setActionError(errorMessage(error));
      void invalidateOperationalQueries(queryClient);
    } finally {
      busyRef.current = false;
      if (mountedRef.current && generation === generationRef.current) setBusy(false);
    }
  }

  async function saveInvoice(propagateError = false): Promise<void> {
    if (busyRef.current) {
      if (propagateError) throw new Error("출하 작업이 진행 중입니다. 다시 시도하세요.");
      return;
    }
    if (!invoiceDirty) return;
    if (cannotClearInvoice) {
      const message = "준비 완료 이력이 있어 인보이스 번호를 비울 수 없습니다.";
      setInvoiceError(message);
      if (propagateError) throw new Error(message);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setInvoiceError(null);
    const generation = generationRef.current;
    try {
      const next = await api.updateShippingInvoice(request.request_id, invoice.trim() || null);
      if (!mountedRef.current || generation !== generationRef.current) return;
      setInvoice(next.invoice_number ?? "");
      setEditingInvoice(false);
      onRequestChange(next);
      void invalidateOperationalQueries(queryClient);
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) setInvoiceError(errorMessage(error));
      void invalidateOperationalQueries(queryClient);
      if (propagateError) throw error;
    } finally {
      busyRef.current = false;
      if (mountedRef.current && generation === generationRef.current) setBusy(false);
    }
  }

  useRegisterDirty(`mobile-shipping-invoice-${request.request_id}`, invoiceDirty, () => saveInvoice(true), () => { setInvoice(request.invoice_number ?? ""); setInvoiceError(null); });

  async function perform(action: Action): Promise<void> {
    setConfirm(null);
    if (busyRef.current) return;
    if (action === "prepare" && (!request.invoice_number?.trim() || !serial.trim())) {
      setActionError("인보이스 번호와 시리얼 번호를 입력하세요.");
      return;
    }
    if (action === "delete") {
      busyRef.current = true;
      setBusy(true);
      try {
        await api.deleteShippingRequest(request.request_id);
        if (mountedRef.current) { onDeleted(); void invalidateOperationalQueries(queryClient); }
      } catch (error) { if (mountedRef.current) setActionError(errorMessage(error)); void invalidateOperationalQueries(queryClient); }
      finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
      return;
    }
    const operation = {
      prepare: () => api.prepareShippingComplete(request.request_id, { serial_numbers: serial.trim() }),
      pickup: () => api.completeShippingPickup(request.request_id),
      prepareCancel: () => api.cancelShippingPrepare(request.request_id, {}),
      pickupCancel: () => api.cancelShippingPickup(request.request_id),
      clear: () => api.clearShippingChecklist(request.request_id),
    }[action];
    await runMutation(operation, action === "pickupCancel" ? onPickupCancelled : onRequestChange);
  }

  async function goToWarehouse(shortage: ShippingRequest["stock_shortages"][number]): Promise<void> {
    if (!onGoToWarehouse || shortagePendingRef.current) return;
    const department = shortage.department?.trim();
    if (!department) { setActionError("대상 부서를 확인할 수 없습니다."); return; }
    shortagePendingRef.current = true;
    setShortagePending(true);
    setActionError(null);
    const generation = generationRef.current;
    try {
      const item = await api.getItem(shortage.item_id);
      if (!mountedRef.current || generation !== generationRef.current) return;
      onGoToWarehouse(item, { workType: "warehouse_io", subType: "warehouse_to_dept", toDepartment: department, forceManualItem: true });
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) setActionError(errorMessage(error));
    } finally {
      shortagePendingRef.current = false;
      if (mountedRef.current && generation === generationRef.current) setShortagePending(false);
    }
  }

  const groups = new Map<string, ShippingRequest["checklist_lines"]>();
  for (const line of request.checklist_lines) {
    const key = line.process_type_code ?? "";
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const primaryAction: Action | null = request.status === "PREPARING" ? "prepare" : request.status === "PREPARED" ? "pickup" : null;
  const checkedCount = request.checklist_lines.filter((line) => line.checked).length;
  const companionCount = request.companion_lines.length;
  const includedBomCount = request.bom_lines.filter((line) => line.included).length;
  const actionDescription = confirm === "prepare" ? "재고 이동 없이 준비 물량을 예약합니다. 체크리스트 미완료 항목은 확인용이며 완료를 막지 않습니다."
    : confirm === "pickup" ? "예약 물량이 실제 재고에서 차감됩니다."
      : confirm === "prepareCancel" ? "재고 이동 없이 준비 예약을 해제하고 다시 수정할 수 있습니다."
        : confirm === "pickupCancel" ? "차감된 재고와 준비 예약이 복구되고 준비 완료 상태로 돌아갑니다."
          : confirm === "delete" ? "요청이 취소 상태로 기록됩니다."
            : "모든 준비 체크가 해제됩니다.";
  return <div data-testid="mobile-shipping-detail" className="flex min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
    <ShippingHeader title="출하 상세" subtitle={request.final_pf_mes_code ?? request.base_pf_mes_code ?? "-"} onBack={onBack} right={<div className="flex items-center gap-1"><ShippingStatus status={request.status} />{request.status !== "CANCELLED" && <button type="button" aria-label="추가 작업" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ color: LEGACY_COLORS.text }}><MoreHorizontal size={20} /></button>}</div>} />
    <div className="scrollbar-hide min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-5">
      <Card title="출하 요약">
        <ShippingItemName name={request.final_pf_item_name ?? request.base_pf_item_name} className="text-base font-bold" />
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0"><span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>출하 수량</span><strong>{request.request_quantity}대</strong></div>
          <div className="min-w-0"><span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>인보이스</span><strong className="break-all">{request.invoice_number || "미입력"}</strong></div>
          <div className="min-w-0"><span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>요청자</span><span className="break-all">{request.requested_by_name}</span></div>
          <div className="min-w-0"><span className="block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>요청 일시</span><span className="break-words">{formatDate(request.created_at)}</span></div>
        </div>
      </Card>
      <Card title="인보이스·시리얼 번호">
        {editingInvoice ? <><div className="flex gap-2"><input aria-label="인보이스 번호" value={invoice} disabled={busy} onChange={(event) => setInvoice(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-[12px] border px-3 text-base focus-visible:ring-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} /><button type="button" onClick={() => void saveInvoice()} disabled={busy || !invoiceDirty || cannotClearInvoice} aria-label="인보이스 저장" className="min-h-11 rounded-[12px] px-3 text-sm font-bold disabled:opacity-45" style={{ background: tint(LEGACY_COLORS.blue, 15), color: LEGACY_COLORS.blue }}>저장</button></div><button type="button" onClick={() => { setInvoice(request.invoice_number ?? ""); setInvoiceError(null); setEditingInvoice(false); }} disabled={busy} className="mt-1 min-h-11 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>인보이스 취소</button></>
          : <div className="flex items-center gap-2"><span className="min-w-0 flex-1 break-all text-sm">{request.invoice_number || "미입력"}</span><button type="button" onClick={() => setEditingInvoice(true)} disabled={busy} className="min-h-11 shrink-0 rounded-[12px] px-3 text-sm font-bold" style={{ background: tint(LEGACY_COLORS.blue, 15), color: LEGACY_COLORS.blue }}>인보이스 수정</button></div>}
        {cannotClearInvoice && editingInvoice && <p className="mt-2 text-sm" style={{ color: LEGACY_COLORS.red }}>준비 완료 이력이 있어 인보이스 번호를 비울 수 없습니다.</p>}
        {invoiceError && <p role="alert" className="mt-2 text-sm" style={{ color: LEGACY_COLORS.red }}>{invoiceError}</p>}
        <div className="mt-3 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}><label htmlFor="shipping-serial" className="mb-2 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>시리얼 번호</label>{request.status === "PREPARING" ? <textarea id="shipping-serial" aria-label="시리얼 번호" value={serial} onChange={(event) => setSerial(event.target.value)} rows={3} className="w-full rounded-[12px] border p-3 text-base focus-visible:ring-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} /> : <p className="whitespace-pre-wrap break-words text-sm">{request.serial_numbers || "-"}</p>}</div>
      </Card>
      {request.stock_shortages.length > 0 && <Card title="부족 재고">{request.stock_shortages.map((shortage) => <div key={`${shortage.item_id}-${shortage.phase}`} className="border-t py-2 text-sm" style={{ borderColor: LEGACY_COLORS.border }}><div>{shortage.item_name} · {shortage.department ?? "부서 미확인"} · 부족 {shortage.shortage_quantity}</div>{onGoToWarehouse && <button type="button" disabled={shortagePending} className="mt-1 min-h-11 text-sm font-bold disabled:opacity-45" style={{ color: LEGACY_COLORS.blue }} onClick={() => void goToWarehouse(shortage)}>창고에서 부서로 이동</button>}</div>)}</Card>}
      <ShippingAccordion title="준비 확인" summary={`${checkedCount}/${request.checklist_lines.length} 완료`} defaultOpen={request.status === "PREPARING"}>
        {request.checklist_lines.length === 0 && <p className="text-sm">체크 항목 없음</p>}
        {Array.from(groups, ([code, lines]) => <details key={code} className="border-t" style={{ borderColor: LEGACY_COLORS.border }}><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold">{code ? `${code} 구성품` : "기타 구성품"}<span className="ml-auto text-xs">{lines.length}개</span><ChevronDown className="h-4 w-4" /></summary><div className="grid gap-1 pb-2">{lines.map((line) => <label key={line.line_id} className="flex min-h-[52px] items-center gap-3 rounded-[12px] px-2 text-sm"><input type="checkbox" aria-label={`${line.item_name} 체크`} checked={line.checked} disabled={request.status !== "PREPARING" || busy} onChange={(event) => void runMutation(() => api.updateShippingChecklist(request.request_id, { checks: [{ item_id: line.item_id, checked: event.target.checked }] }))} className="h-5 w-5" /><span className="min-w-0 flex-1 break-words">{line.item_name}<small className="block" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"}</small></span><span>{line.quantity}개</span></label>)}</div></details>)}
        <p className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>체크리스트는 확인용입니다. 미완료 항목이 있어도 준비 완료할 수 있습니다.</p>
      </ShippingAccordion>
      <ShippingAccordion title="추가 PF·PA 정보">
        <Info label="최종 PF" value={`${request.final_pf_item_name ?? request.base_pf_item_name} · ${request.final_pf_mes_code ?? request.base_pf_mes_code ?? "-"}`} />
        <Info label="최종 PA" value={request.final_pa_item_name ? `${request.final_pa_item_name} · ${request.final_pa_mes_code ?? "-"}` : "-"} />
        <Info label="기준 PF" value={request.base_pf_item_name} />
      </ShippingAccordion>
      <ShippingAccordion title="BOM·동반 출하품" summary={`${includedBomCount + companionCount}건`}>
        {(["PA", "PF"] as const).map((stage) => <div key={stage}><h3 className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{stage} 구성품</h3>{request.bom_lines.filter((line) => line.parent_stage === stage && line.included).map((line) => <div key={line.line_id} className="flex min-w-0 items-center gap-3 border-t py-2 text-sm" style={{ borderColor: LEGACY_COLORS.border }}><div className="min-w-0 flex-1"><ShippingItemName name={line.item_name} /><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"}</span></div><span className="shrink-0 whitespace-nowrap">{line.quantity}{line.unit}</span></div>)}</div>)}
        <h3 className="mt-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>동반 출하품</h3>{request.companion_lines.map((line) => <div key={line.line_id} className="flex min-w-0 items-center gap-3 border-t py-2 text-sm" style={{ borderColor: LEGACY_COLORS.border }}><div className="min-w-0 flex-1"><ShippingItemName name={line.item_name} /><span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"}</span></div><span className="shrink-0 whitespace-nowrap">{line.quantity}{line.unit}</span></div>)}
      </ShippingAccordion>
      <ShippingAccordion title="메모·이력" summary={request.notes ? "요청 메모 있음" : undefined}>
        {request.notes && <div><h3 className="text-sm font-bold">요청 메모</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{request.notes}</p></div>}
        {request.latest_preparation_revision?.affects_preparation && <div className="mt-3"><h3 className="text-sm font-bold">최근 준비 정보 변경</h3><p className="mt-2 text-sm">수정됨 · {request.latest_preparation_revision.edited_by_name} · {formatKst(request.latest_preparation_revision.created_at)}</p><p className="mt-1 text-sm">{(() => { const labels = Array.from(new Set(request.latest_preparation_revision!.changes.map((change) => FIELD_LABEL[change.field] ?? change.field))); return labels.length ? `${labels.join(" · ")} 수정` : "준비 정보가 수정되었습니다."; })()}</p><details className="mt-2"><summary className="min-h-11 cursor-pointer text-sm font-bold">변경 내용 보기</summary><ul className="grid gap-2">{request.latest_preparation_revision.changes.map((change, index) => <RevisionChange key={`${change.field}-${index}`} change={change} />)}</ul></details></div>}
        <h3 className="mt-3 text-sm font-bold">변경 이력</h3><div>{revisions.isLoading ? <p className="text-sm">불러오는 중</p> : revisions.isError ? <button type="button" onClick={() => void revisions.refetch()} className="min-h-11 text-sm">다시 시도</button> : revisions.data?.length ? revisions.data.map((revision) => <details key={revision.revision_id} className="border-t py-2" style={{ borderColor: LEGACY_COLORS.border }}><summary className="min-h-11 cursor-pointer text-sm font-bold">{revision.edited_by_name} · {formatDate(revision.created_at)} · {revision.summary}</summary><ul className="grid gap-2">{revision.changes.map((change, index) => <RevisionChange key={`${change.field}-${index}`} change={change} />)}</ul></details>) : <p className="text-sm">변경 이력이 없습니다.</p>}</div>
        <h3 className="mt-3 text-sm font-bold">작업 기록</h3>{request.events.map((event) => <Info key={event.event_id} label={formatDate(event.created_at)} value={event.message ?? event.event_type} />)}{request.transactions.map((log) => <div key={log.log_id}><Info label={formatDate(log.created_at)} value={`${log.item_name} · ${log.quantity_change} · ${log.reference_no ?? "-"}`} /><div data-testid={`shipping-transaction-actor-${log.log_id}`} className="break-words text-sm">처리자 {log.produced_by ?? "기록 없음"}</div></div>)}{request.events.length === 0 && request.transactions.length === 0 && <p className="text-sm">기록이 없습니다.</p>}
      </ShippingAccordion>
      {actionError && <p role="alert" className="rounded-[12px] p-3 text-sm" style={{ background: LEGACY_COLORS.errorBg, color: LEGACY_COLORS.red }}>{actionError}</p>}
    </div>
    {primaryAction && <StickyFooter embedded compact><PrimaryActionButton label={ACTION_LABEL[primaryAction]} intent="primary" disabled={busy || (primaryAction === "prepare" && (!request.invoice_number?.trim() || !serial.trim()))} onClick={() => setConfirm(primaryAction)} /></StickyFooter>}
    <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="추가 작업">
      <div className="grid gap-1 px-4 pb-4">
        {request.status === "PREPARING" && <><button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} disabled={busy} className="min-h-11 rounded-[12px] px-3 text-left text-sm font-bold">요청 수정</button><button type="button" onClick={() => { setMenuOpen(false); setConfirm("clear"); }} disabled={busy || request.checklist_lines.length === 0} className="min-h-11 rounded-[12px] px-3 text-left text-sm font-bold disabled:opacity-45">전체 해제</button><button type="button" onClick={() => { setMenuOpen(false); setConfirm("delete"); }} disabled={busy} className="min-h-11 rounded-[12px] px-3 text-left text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>요청 취소</button></>}
        {request.status === "PREPARED" && <button type="button" onClick={() => { setMenuOpen(false); setConfirm("prepareCancel"); }} disabled={busy} className="min-h-11 rounded-[12px] px-3 text-left text-sm font-bold">준비 완료 취소</button>}
        {request.status === "PICKED_UP" && <button type="button" onClick={() => { setMenuOpen(false); setConfirm("pickupCancel"); }} disabled={busy} className="min-h-11 rounded-[12px] px-3 text-left text-sm font-bold">픽업 취소</button>}
      </div>
    </BottomSheet>
    <ConfirmModal open={confirm !== null} title={`${confirm ? ACTION_LABEL[confirm] : "작업"} 확인`} confirmLabel={confirm ? ACTION_LABEL[confirm] : "확인"} cancelLabel="돌아가기" tone={confirm === "delete" || confirm === "pickupCancel" ? "caution" : "normal"} confirmAccent={LEGACY_COLORS.blueSolid} className={`${presentation.scope} [&_button]:min-h-11 [&>div]:!bg-[var(--c-bg)]`} onClose={() => setConfirm(null)} onConfirm={() => confirm ? perform(confirm) : undefined} busy={busy}>
      <div className="rounded-[12px] border p-3 text-sm" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}><div className="flex min-w-0 items-start gap-2 font-bold"><span className="min-w-0 flex-1 break-words">{confirm === "prepare" ? "실제 준비품 · " : ""}{request.final_pf_item_name ?? request.base_pf_item_name} · {request.final_pf_mes_code ?? request.base_pf_mes_code ?? "-"}</span><span className="shrink-0 whitespace-nowrap">{request.request_quantity}대</span></div>{confirm === "prepare" && <div className="mt-1 break-words">기준 PF · {request.base_pf_item_name} · {request.base_pf_mes_code ?? "-"}</div>}{request.companion_lines.map((line) => <div key={line.line_id} className="mt-1 flex min-w-0 gap-2"><span className="min-w-0 flex-1 break-words">동반 {line.item_name} · {line.mes_code ?? "-"}</span><span className="shrink-0 whitespace-nowrap">{line.quantity}{line.unit}</span></div>)}</div><p className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{actionDescription}</p>
    </ConfirmModal>
  </div>;
}
