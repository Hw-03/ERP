"use client";

/**
 * 거래 정정 통합 모달 — 정보(메타) 수정 + 수량 보정을 한 화면에서.
 * 기존 TransactionEditModal / TransactionQuantityCorrectModal 을 흡수(2차 #2: UI 통합).
 * 백엔드는 그대로 2엔드포인트(metaEdit / quantityCorrect). 변경된 영역만 호출.
 *
 * 작업자 식별용 PIN — 실제 보안 인증이 아님.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  api,
  type Employee,
  type TransactionLog,
  type TransactionType,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { AppSelect } from "../common/AppSelect";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { getHistoryDisplayLabel } from "./historyBatchInterpreter";

/** 직접 수량 보정 가능 거래 — 그 외는 수량조정(ADJUST) 거래로 처리(재고 정합성). */
export const QUANTITY_CORRECTABLE_TYPES: ReadonlySet<TransactionType> =
  new Set<TransactionType>(["RECEIVE", "SHIP"]);

interface Props {
  open: boolean;
  log: TransactionLog | null;
  canMetaEdit: boolean;
  canQtyCorrect: boolean;
  onClose: () => void;
  onMetaSuccess: (updated: TransactionLog) => void;
  onQtySuccess: (result: { original: TransactionLog; correction: TransactionLog }) => void;
}

const TITLE_ID = "transaction-edit-unified-title";

export function TransactionEditUnifiedModal({
  open,
  log,
  canMetaEdit,
  canQtyCorrect,
  onClose,
  onMetaSuccess,
  onQtySuccess,
}: Props) {
  const operator = useCurrentOperator();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);

  const [notes, setNotes] = useState("");
  const [refNo, setRefNo] = useState("");
  const [producedBy, setProducedBy] = useState("");
  const [qty, setQty] = useState(""); // 항상 양수 입력
  const [reason, setReason] = useState("");
  const [editorId, setEditorId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getEmployees({ activeOnly: true }).then(setEmployees).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !log) return;
    setNotes(log.notes ?? "");
    setRefNo(log.reference_no ?? "");
    setProducedBy(log.produced_by ?? "");
    setQty(String(Math.abs(Number(log.quantity_change))));
    setReason("");
    setPin("");
    setError("");
    setEditorId(operator?.employee_id ?? "");
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }, [open, log, operator]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !log) return null;

  const isShip = log.transaction_type === "SHIP";
  const qtyNum = Number(qty);
  const willSendQty = isShip ? -Math.abs(qtyNum) : Math.abs(qtyNum);
  const delta = willSendQty - Number(log.quantity_change);

  const metaChanged =
    canMetaEdit &&
    (notes !== (log.notes ?? "") ||
      refNo !== (log.reference_no ?? "") ||
      producedBy !== (log.produced_by ?? ""));
  const qtyValid =
    canQtyCorrect && qty.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0;
  const qtyChanged = qtyValid && delta !== 0;

  const canSubmit =
    (metaChanged || qtyChanged) &&
    reason.trim().length > 0 &&
    !!editorId &&
    pin.length > 0 &&
    !submitting;

  async function handleSubmit() {
    if (!log || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      if (metaChanged) {
        const updated = await api.metaEditTransaction(log.log_id, {
          notes: notes !== (log.notes ?? "") ? notes : undefined,
          reference_no:
            refNo !== (log.reference_no ?? "") ? (refNo || null) : undefined,
          produced_by:
            producedBy !== (log.produced_by ?? "") ? (producedBy || null) : undefined,
          reason: reason.trim(),
          edited_by_employee_id: editorId,
          edited_by_pin: pin,
        });
        onMetaSuccess(updated);
      }
      if (qtyChanged) {
        const result = await api.quantityCorrectTransaction(log.log_id, {
          quantity_change: willSendQty,
          reason: reason.trim(),
          edited_by_employee_id: editorId,
          edited_by_pin: pin,
        });
        onQtySuccess(result);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "정정 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        ref={trapRef}
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[24px] border p-6"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div id={TITLE_ID} className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              거래 정정
            </div>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {getHistoryDisplayLabel(log)} · {log.item_name}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10">
            <X className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
          </button>
        </div>

        <div className="space-y-3">
          {/* 정보(메타) */}
          <SectionTitle>정보 수정</SectionTitle>
          {canMetaEdit ? (
            <>
              <FieldRow label="메모">
                <textarea
                  ref={firstInputRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[56px] w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
              <FieldRow label="참조번호">
                <input
                  type="text"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
              <FieldRow label="담당자">
                <input
                  type="text"
                  value={producedBy}
                  onChange={(e) => setProducedBy(e.target.value)}
                  placeholder="예: 홍길동(조립)"
                  className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </FieldRow>
            </>
          ) : (
            <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              이 거래 유형은 정보 수정을 지원하지 않습니다 (복합 거래).
            </p>
          )}

          {/* 수량 보정 */}
          <div className="border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <SectionTitle>수량 보정</SectionTitle>
          </div>
          {canQtyCorrect ? (
            <>
              <div
                className="flex items-start gap-2 rounded-[12px] border px-3 py-2.5"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`,
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
                <p className="text-xs" style={{ color: LEGACY_COLORS.text }}>
                  실제 창고 재고가 바뀝니다. 차액만큼 수량 보정 거래가 생성되며 원본은 보존됩니다.
                  바꾸지 않으려면 그대로 두세요.
                </p>
              </div>
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                원본 수량 변화{" "}
                <b style={{ color: LEGACY_COLORS.text }}>
                  {Number(log.quantity_change) >= 0 ? "+" : ""}
                  {formatQty(log.quantity_change)} {log.item_unit}
                </b>
              </div>
              <FieldRow label={`보정 수량 (${isShip ? "양수 입력 → 음수 저장" : "양수만"})`}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-[12px] border px-3 py-2 text-base outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
                {qtyValid && delta !== 0 && (
                  <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    저장값: {willSendQty > 0 ? "+" : ""}{willSendQty} · 차액: {delta > 0 ? "+" : ""}{delta}
                  </p>
                )}
              </FieldRow>
            </>
          ) : (
            <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              이 거래는 직접 수량 보정을 지원하지 않습니다. 수량을 바로잡으려면
              <b style={{ color: LEGACY_COLORS.text }}> 수량조정 입출고</b>로 처리하세요.
            </p>
          )}

          {/* 공통 — 사유 / 수정자 / PIN */}
          <div className="border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <FieldRow label="정정 사유 (필수)">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="왜 정정하는지 짧게 입력"
                className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="수정자">
              <AppSelect
                value={editorId}
                onChange={setEditorId}
                size="md"
                placeholder="선택"
                options={employees.map((e) => ({
                  value: e.employee_id,
                  label: `${e.name} (${e.employee_code})`,
                }))}
              />
            </FieldRow>
            <FieldRow label="PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={20}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="0000"
                className="w-full rounded-[12px] border px-3 py-2 text-sm tracking-widest outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </FieldRow>
          </div>

          {!metaChanged && !qtyChanged && (
            <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              변경된 내용이 없습니다. 정보 또는 수량을 바꾼 뒤 저장하세요.
            </p>
          )}
          {error && (
            <p className="text-xs" style={{ color: LEGACY_COLORS.red }}>
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-[14px] border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            취소
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-[14px] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: LEGACY_COLORS.blue }}
          >
            {submitting ? "저장 중..." : "정정 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-black uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
