"use client";

import { canManageStocktakeRounds } from "./stocktakeAuthority";

import { useEffect, useRef, useState } from "react";
import { isStocktakeNotApplied, stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeCommandKind } from "@/lib/api/types/stocktake";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { formatKstDateTime } from "@/lib/mes-format";
import type { Operator } from "../login/useCurrentOperator";
import type { RecoveredStocktakeCommand } from "./StocktakeCommandRecovery";
import { STOCKTAKE_CARD } from "./StocktakeCountEditor";
import { StocktakeDisclosure } from "./StocktakeDisclosure";

type Correction = { correction_id: string; version: number; status: string; scope_hash?: string; source_type: string; source_id: string; requester_id?: string; requester_name?: string; target_status: string; reason: string; evidence: string; scope?: Record<string, unknown> };
type Preview = { preview_id: string; preview_hash: string; expires_at?: string; physical?: unknown; cells?: Array<{ item_id: string; scope_id: string; quantities: Record<string, number>; reservations: Record<string, number>; after_reservations: Record<string, number> }>; observations?: Array<{ application_id: string; item_id: string; scope_id: string; observation_epoch: number }> };
type Event = { event_id: string; kind: string; actor_name: string; created_at: string; payload: unknown };
type Props = { token: string; operator: Operator; onChanged: () => void; recovered?: RecoveredStocktakeCommand | null };

const card = STOCKTAKE_CARD;
const field = "min-h-11 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] px-3 py-2 text-sm text-[var(--c-text)]";
const button = "min-h-11 rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] px-4 py-2 text-sm font-semibold text-[var(--c-text)] disabled:opacity-50";
const endpoint = "/api/inventory/business-corrections";
const SOURCE_LABELS: Record<string, string> = { InventoryOperation: "재고 업무", ShippingRequest: "출하 요청", StockRequest: "재고 요청", HandoverDoc: "인수인계" };
const STATUS_LABELS: Record<string, string> = { REQUESTED: "검토 대기", APPLIED: "정정 완료", REJECTED: "거절", WITHDRAWN: "철회" };

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "업무 정정을 완료하지 못했습니다."; }
function errorCode(error: unknown): string | undefined { return error && typeof error === "object" && "code" in error ? String(error.code) : undefined; }
function utcTimestamp(value: string): string { return /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`; }

export function BusinessCorrectionPanel({ token, operator, onChanged, recovered }: Props) {
  const [items, setItems] = useState<Correction[]>([]);
  const [detail, setDetail] = useState<Correction | null>(null);
  const detailRef = useRef<Correction | null>(null);
  detailRef.current = detail;
  const [events, setEvents] = useState<Event[]>([]);
  const [sourceType, setSourceType] = useState("InventoryOperation");
  const [sourceId, setSourceId] = useState("");
  const [targetStatus, setTargetStatus] = useState("CANCELLED");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [pin, setPin] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState<{ kind: string; key: string } | null>(null);
  const reviewGeneration = useRef(0);
  const listGeneration = useRef(0);
  const busyRef = useRef(false);
  const realtimeRevision = useRealtimeRevision();
  useEffect(() => {
    if (recovered?.token === token && unknown?.key === recovered.entry.key && unknown.kind === recovered.entry.kind) {
      setUnknown(null); setPreview(null); setPin(""); setError("");
    }
  }, [recovered, token, unknown]);
  const canDecide = canManageStocktakeRounds(operator);
  useRegisterDirty("stocktake-business-correction", busy || !!unknown, async () => { throw new Error("명령 결과를 먼저 확인해 주세요."); }, undefined, { mode: "auto-save", warnOnUnload: true });

  useEffect(() => {
    let current = true;
    const generation = ++listGeneration.current;
    void stocktakeApi.read<{ items: Correction[] }>(`${endpoint}?limit=50`, token)
      .then(async result => {
        if (!current || generation !== listGeneration.current) return;
        setItems(result.items);
        const selected = detailRef.current;
        if (!selected) return;
        const updated = await stocktakeApi.read<Correction>(`${endpoint}/${selected.correction_id}`, token);
        if (!current || generation !== listGeneration.current || detailRef.current?.correction_id !== selected.correction_id) return;
        if (updated.version !== selected.version || updated.status !== selected.status || updated.scope_hash !== selected.scope_hash) setPreview(null);
        setDetail(updated);
      })
      .catch(cause => { if (current && generation === listGeneration.current) setError(errorMessage(cause)); });
    return () => { current = false; };
  }, [token, realtimeRevision, recovered]);

  const reload = async () => {
    const generation = ++listGeneration.current;
    const result = await stocktakeApi.read<{ items: Correction[] }>(`${endpoint}?limit=50`, token);
    if (generation !== listGeneration.current) return;
    setItems(result.items);
    if (detail) {
      const generation = reviewGeneration.current;
      const current = await stocktakeApi.read<Correction>(`${endpoint}/${detail.correction_id}`, token);
      if (generation === reviewGeneration.current) setDetail(current);
    }
  };
  const review = async (id: string) => {
    const generation = ++reviewGeneration.current;
    setError(""); setPreview(null); setDetail(null); setEvents([]); setPin("");
    try {
      const [current, history] = await Promise.all([
        stocktakeApi.read<Correction>(`${endpoint}/${id}`, token),
        stocktakeApi.read<{ items: Event[] }>(`${endpoint}/${id}/events`, token),
      ]);
      if (generation === reviewGeneration.current) { setDetail(current); setEvents(history.items); }
    } catch (cause) { if (generation === reviewGeneration.current) setError(errorMessage(cause)); }
  };
  const command = async (kind: StocktakeCommandKind, path: string, payload: Record<string, unknown>, admin = false): Promise<Record<string, unknown> | null> => {
    if (busyRef.current || unknown) return null;
    const key = crypto.randomUUID();
    busyRef.current = true;
    setBusy(true); setError("");
    try {
      return await stocktakeApi.command<Record<string, unknown>>(kind, path, token, payload, { key, ...(admin ? { adminPin: pin } : {}) });
    } catch (cause) {
      setError(errorMessage(cause));
      if (errorCode(cause) === "COMMAND_RESULT_UNKNOWN") setUnknown({ kind, key });
      return null;
    } finally { if (admin) setPin(""); busyRef.current = false; setBusy(false); }
  };
  const request = async () => {
    if (!sourceId.trim() || !reason.trim() || !evidence.trim()) { setError("원업무 ID, 사유, 증빙을 모두 입력해 주세요."); return; }
    const result = await command("correction_request", endpoint, { source_type: sourceType, source_id: sourceId.trim(), target_status: targetStatus, reason: reason.trim(), evidence: evidence.trim() });
    if (result) { setSourceId(""); setReason(""); setEvidence(""); onChanged(); await reload(); }
  };
  const prepare = async () => {
    if (!canDecide || !detail || !pin) { setError("부서 정·부 권한과 새 관리자 PIN이 필요합니다."); return; }
    const generation = reviewGeneration.current;
    const result = await command("correction_preview", `${endpoint}/${detail.correction_id}/previews`, { expected_version: detail.version }, true);
    if (generation === reviewGeneration.current && result && typeof result.preview_id === "string" && typeof result.preview_hash === "string") setPreview(result as Preview);
  };
  const decide = async (kind: "approve" | "reject" | "withdraw") => {
    if (!detail) return;
    if (kind !== "withdraw" && !canDecide) { setError("부서 정·부 담당자만 승인하거나 거절할 수 있습니다."); return; }
    if (kind === "withdraw" && detail.requester_id !== operator.employee_id) { setError("정정 요청자만 철회할 수 있습니다."); return; }
    if (kind !== "withdraw" && !pin) { setError("새 관리자 PIN을 입력해 주세요."); return; }
    if (kind !== "approve" && !decisionReason.trim()) { setError("결정 사유를 입력해 주세요."); return; }
    if (kind === "approve" && !preview) return;
    const payload = kind === "approve" ? { expected_version: detail.version, preview_id: preview!.preview_id, preview_hash: preview!.preview_hash } : { expected_version: detail.version, reason: decisionReason.trim() };
    const result = await command(`correction_${kind}`, `${endpoint}/${detail.correction_id}/${kind}`, payload, kind !== "withdraw");
    if (result) { setPin(""); setDecisionReason(""); setPreview(null); onChanged(); await reload(); await review(detail.correction_id); }
  };
  const lookup = async () => {
    if (!unknown) return;
    setBusy(true);
    try {
      const receipt = await stocktakeApi.read<Record<string, unknown>>(`/api/stocktakes/commands/${encodeURIComponent(unknown.key)}?kind=${encodeURIComponent(unknown.kind)}`, token);
      setError(`영수증 확인: ${String(receipt.receipt_id ?? "완료")}`); setUnknown(null); setPin(""); setPreview(null); onChanged(); await reload();
    } catch (cause) {
      if (isStocktakeNotApplied(cause)) { setUnknown(null); setPreview(null); setPin(""); setError("미반영으로 확정된 요청입니다."); onChanged(); }
      else setError(`영수증 조회 실패. 같은 키를 보관하고 확인해 주세요. ${errorMessage(cause)}`);
    }
    finally { setBusy(false); }
  };

  return <div className="space-y-3 break-words text-sm text-[var(--c-text)]">
    {error && <p role="alert" className="rounded-xl border border-[var(--c-red)] bg-[var(--c-s1)] p-3 text-sm text-[var(--c-red)]">{error}</p>}
    {unknown && <section className={card}><p>명령 결과가 불확실합니다. 새 명령을 보내지 말고 영수증을 조회해 주세요.</p><button className={button} disabled={busy} onClick={() => void lookup()}>영수증 조회</button></section>}
    {busy && <p role="status" className="px-3 text-[var(--c-muted2)]">업무 정정 요청을 처리하는 중입니다.</p>}
    <StocktakeDisclosure title="업무 정정">
    <section className={card}><h2 className="mb-2 text-lg font-semibold">수량 불변 업무 정정 요청</h2><p className="mb-3 text-sm text-[var(--c-muted2)]">과거 수량을 되돌리지 않고 증빙된 원업무 전체의 상태·예약을 심사합니다. 실제 물건의 이동은 현재 업무로 처리하세요.</p>
      <div className="grid gap-3 lg:grid-cols-2"><label className="text-sm">원업무 종류<select className={field} value={sourceType} onChange={event => setSourceType(event.target.value)}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">원업무 ID<input aria-label="원업무 ID" className={field} value={sourceId} onChange={event => setSourceId(event.target.value)} /></label>
      <label className="text-sm">목표 상태<select className={field} value={targetStatus} onChange={event => setTargetStatus(event.target.value)}><option value="CANCELLED">취소</option><option value="PREPARING">준비 중</option></select></label>
      <label className="text-sm">정정 사유<input aria-label="정정 사유" className={field} value={reason} onChange={event => setReason(event.target.value)} /></label></div>
      <label className="mt-3 block text-sm">증빙<textarea aria-label="증빙" className={field} value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <button className={`${button} mt-3`} disabled={busy || !!unknown} onClick={() => void request()}>정정 요청</button>
    </section>
    <section className={card}><h2 className="mb-3 text-lg font-semibold">정정 요청 목록</h2>{!items.length && <p className="text-sm text-[var(--c-muted2)]">정정 요청이 없습니다.</p>}<ul className="space-y-2">{items.map(item => <li key={item.correction_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--c-border)] p-3 text-sm"><span className="min-w-0 break-all">{SOURCE_LABELS[item.source_type] ?? item.source_type} · {item.source_id} · {STATUS_LABELS[item.status] ?? item.status} · {item.requester_name}</span><button className={`${button} text-xs`} onClick={() => void review(item.correction_id)}>상세 검토</button></li>)}</ul></section>
    {detail && <section className={card}><h2 className="mb-3 text-lg font-semibold">원업무 전체 범위</h2><p className="break-all text-sm">{SOURCE_LABELS[detail.source_type] ?? detail.source_type} · {detail.source_id} · {STATUS_LABELS[detail.status] ?? detail.status} · 요청자 {detail.requester_name}</p><p className="mt-2 text-sm">요청 사유: {detail.reason}<br />증빙: {detail.evidence}</p>
      <div className="mt-3 rounded-xl bg-[var(--c-s2)] p-3 text-sm"><h3 className="font-medium">원업무 전체 상태</h3><ul className="mt-2 space-y-1">{(Array.isArray(detail.scope?.roots) ? detail.scope.roots as Array<{ type: string; state: { status?: string } }> : []).map((root, index) => <li key={`${root.type}-${index}`}>{root.type} · 현재 {root.state.status ?? "상세 증빙 참조"} · 요청 상태 {detail.target_status}</li>)}</ul><p className="mt-2">연결 문서 {Array.isArray(detail.scope?.roots) ? detail.scope.roots.length : 0}건 · 연결 라인 {Array.isArray(detail.scope?.members) ? detail.scope.members.length : 0}건 · 원효과 {Array.isArray(detail.scope?.effects) ? detail.scope.effects.length : 0}건</p></div>
      {canDecide && <details className="mt-2 rounded-xl border border-[var(--c-border)] p-3 text-sm"><summary className="font-medium">원업무 전체 연결 원문 증빙</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(detail.scope ?? {}, null, 2)}</pre></details>}
      <div className="mt-3 space-y-2 text-sm">{events.map(event => <details key={event.event_id} className="rounded-lg border border-[var(--c-border)] p-2"><summary>{event.kind} · {event.actor_name} · {formatKstDateTime(utcTimestamp(event.created_at))} KST</summary>{canDecide && <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(event.payload, null, 2)}</pre>}</details>)}</div>
      {detail.status === "REQUESTED" && canDecide && <><label className="mt-4 block text-sm">정정 승인 PIN<input aria-label="정정 승인 PIN" type="password" className={field} value={pin} autoComplete="off" onChange={event => setPin(event.target.value)} /></label><p className="mt-1 text-xs text-[var(--c-muted2)]">미리보기와 승인·거절마다 새 관리자 PIN을 입력해 주세요.</p>
        <button className={`${button} mt-3`} disabled={busy || !!unknown} onClick={() => void prepare()}>승인 미리보기</button>
        {preview && <div className="mt-3 rounded-xl border border-[var(--c-border)] p-3"><h3 className="font-semibold">승인 검토</h3><p className="text-sm">만료: {preview.expires_at ? `${formatKstDateTime(preview.expires_at)} KST` : "서버 기준"} · 물리 재고는 바꾸지 않습니다.</p><div className="mt-2 max-h-52 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>품목·위치</th><th>분류</th><th>현재 재고</th><th>현재 예약</th><th>정정 후 예약</th></tr></thead><tbody>{(preview.cells ?? []).flatMap(cell => Object.entries(cell.quantities).map(([category, quantity]) => <tr key={`${cell.item_id}-${cell.scope_id}-${category}`} className="border-t border-[var(--c-border)]"><td>{cell.item_id} · {cell.scope_id}</td><td>{categoryLabel(category)}</td><td>{quantity}</td><td>{cell.reservations[category] ?? 0}</td><td>{cell.after_reservations[category] ?? 0}</td></tr>))}</tbody></table></div><p className="mt-2 text-sm">실사 적용 증빙 연결 {preview.observations?.length ?? 0}건</p><details className="mt-2 text-xs"><summary>재고·예약 원문 증빙</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify({ physical: preview.physical, cells: preview.cells, observations: preview.observations }, null, 2)}</pre></details><button className={`${button} mt-2`} disabled={busy || !!unknown || !pin} onClick={() => void decide("approve")}>검토한 내용으로 승인</button></div>}
      </>}
      {detail.status === "REQUESTED" && (canDecide || detail.requester_id === operator.employee_id) && <><label className="mt-4 block text-sm">결정 사유<textarea className={field} value={decisionReason} onChange={event => setDecisionReason(event.target.value)} /></label><div className="mt-3 flex flex-wrap gap-2">{canDecide && <button className={button} disabled={busy || !!unknown || !pin || !decisionReason.trim()} onClick={() => void decide("reject")}>정정 거절</button>}{detail.requester_id === operator.employee_id && <button className={button} disabled={busy || !!unknown || !decisionReason.trim()} onClick={() => void decide("withdraw")}>요청 철회</button>}</div></>}
    </section>}
    </StocktakeDisclosure>
  </div>;
}

function categoryLabel(category: string): string {
  return { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "불용" }[category as "normal" | "defect" | "b_grade" | "obsolete"] ?? category;
}
