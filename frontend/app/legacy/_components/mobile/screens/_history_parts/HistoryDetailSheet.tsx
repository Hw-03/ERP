"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatDateTime, formatQty } from "@/lib/mes/format";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import type { ToastState } from "@/lib/ui/Toast";
import { useCurrentOperator } from "../../../login/useCurrentOperator";
import { TYPO } from "../../tokens";
import { PrimaryActionButton, SectionCard, SheetHeader } from "../../primitives";

const META_EDITABLE_TYPES = new Set([
  "RECEIVE",
  "SHIP",
  "ADJUST",
  "TRANSFER",
  "PRODUCTION",
  "DEFECTIVE",
]);

type Mode = "info" | "edit";

export function HistoryDetailSheet({
  log,
  onClose,
  showToast,
  onEdited,
}: {
  log: TransactionLog | null;
  onClose: () => void;
  showToast: (toast: ToastState) => void;
  onEdited: () => void;
}) {
  const operator = useCurrentOperator();
  const [mode, setMode] = useState<Mode>("info");
  const [edits, setEdits] = useState<TransactionEditLog[]>([]);
  const [editsLoading, setEditsLoading] = useState(false);

  useEffect(() => {
    if (!log) return;
    setMode("info");
    setEditsLoading(true);
    void api
      .getTransactionEdits(log.log_id)
      .then(setEdits)
      .catch(() => setEdits([]))
      .finally(() => setEditsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log.log_id 만 추적 (의도적)
  }, [log?.log_id]);

  if (!log) return null;

  const editable = META_EDITABLE_TYPES.has(log.transaction_type);
  const tone = transactionColor(log.transaction_type);

  return (
    <BottomSheet open={!!log} onClose={onClose}>
      <SheetHeader
        title={log.item_name}
        subtitle={`${getTransactionLabel(log.transaction_type)} · ${formatDateTime(log.created_at)}`}
        onClose={onClose}
      />

      <div className="flex flex-col gap-3 px-5 pb-4">
        {mode === "info" ? (
          <>
            {/* 수량 강조 */}
            <div
              className="rounded-[16px] border px-4 py-3"
              style={{
                background: `${tone}10`,
                borderColor: `${tone}55`,
              }}
            >
              <div
                className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                변동 / 처리 후
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`${TYPO.headline} font-black tabular-nums`}
                  style={{ color: tone }}
                >
                  {log.quantity_change >= 0 ? "+" : ""}
                  {formatQty(log.quantity_change)}
                </span>
                <span
                  className={`${TYPO.body} tabular-nums`}
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  · 처리 후 {formatQty(log.quantity_after)}
                </span>
              </div>
              {log.quantity_before != null ? (
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  이전 {formatQty(log.quantity_before)}
                </div>
              ) : null}
            </div>

            <SectionCard padding="none">
              {[
                ["품목 코드", log.erp_code ?? "-"],
                ["참조번호", log.reference_no ?? "-"],
                ["작업자", log.produced_by ?? "-"],
                ["메모", log.notes ?? "-"],
              ].map(([label, value], i, arr) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                  style={{
                    borderBottom:
                      i === arr.length - 1
                        ? "none"
                        : `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  <span
                    className={`${TYPO.caption} font-semibold`}
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {label}
                  </span>
                  <span
                    className={`${TYPO.body} text-right`}
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </SectionCard>

            {/* 수정 이력 */}
            {edits.length > 0 ? (
              <SectionCard title="수정 이력" padding="none">
                <div className="flex flex-col">
                  {edits.map((e, idx) => (
                    <div
                      key={e.edit_id}
                      className="px-4 py-3"
                      style={{
                        borderBottom:
                          idx === edits.length - 1
                            ? "none"
                            : `1px solid ${LEGACY_COLORS.border}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`${TYPO.body} font-bold`}
                          style={{ color: LEGACY_COLORS.text }}
                        >
                          {e.edited_by_name}
                        </span>
                        <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                          {formatDateTime(e.created_at)}
                        </span>
                      </div>
                      <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted2 }}>
                        사유: {e.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {editsLoading ? (
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                수정 이력을 불러오는 중…
              </div>
            ) : null}

            {editable ? (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="flex items-center justify-center gap-2 rounded-[14px] border py-3 font-bold"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.blue as string,
                }}
              >
                <Pencil size={16} />
                메타 수정 (관리자)
              </button>
            ) : null}
          </>
        ) : (
          <MetaEditPanel
            log={log}
            operator={operator}
            onCancel={() => setMode("info")}
            onSuccess={() => {
              showToast({ type: "success", message: "거래 메타데이터를 수정했습니다." });
              onEdited();
              setMode("info");
            }}
            showToast={showToast}
          />
        )}
      </div>
    </BottomSheet>
  );
}

function MetaEditPanel({
  log,
  operator,
  onCancel,
  onSuccess,
  showToast,
}: {
  log: TransactionLog;
  operator: ReturnType<typeof useCurrentOperator>;
  onCancel: () => void;
  onSuccess: () => void;
  showToast: (toast: ToastState) => void;
}) {
  const [referenceNo, setReferenceNo] = useState(log.reference_no ?? "");
  const [producedBy, setProducedBy] = useState(log.produced_by ?? "");
  const [notes, setNotes] = useState(log.notes ?? "");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!operator) {
      setError("로그인 정보를 확인해 주세요.");
      return;
    }
    if (reason.trim().length === 0) {
      setError("수정 사유를 입력해 주세요.");
      return;
    }
    if (pin.length < 4) {
      setError("관리자 PIN을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.metaEditTransaction(log.log_id, {
        reference_no: referenceNo === log.reference_no ? undefined : referenceNo || null,
        produced_by: producedBy === log.produced_by ? undefined : producedBy || null,
        notes: notes === log.notes ? undefined : notes || null,
        reason: reason.trim(),
        edited_by_employee_id: operator.employee_id,
        edited_by_pin: pin,
      });
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수정에 실패했습니다.";
      setError(msg);
      showToast({ type: "error", message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel label="참조번호">
        <input
          value={referenceNo}
          onChange={(e) => setReferenceNo(e.target.value)}
          className={`${TYPO.body} rounded-[14px] border px-3 py-2 outline-none`}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </FieldLabel>
      <FieldLabel label="작업자">
        <input
          value={producedBy}
          onChange={(e) => setProducedBy(e.target.value)}
          className={`${TYPO.body} rounded-[14px] border px-3 py-2 outline-none`}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </FieldLabel>
      <FieldLabel label="메모">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${TYPO.body} rounded-[14px] border px-3 py-2 outline-none`}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </FieldLabel>
      <FieldLabel label="수정 사유 (필수)">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 참조번호 오기재 정정"
          className={`${TYPO.body} rounded-[14px] border px-3 py-2 outline-none`}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </FieldLabel>
      <FieldLabel label="내 PIN">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className={`${TYPO.title} rounded-[14px] border px-3 py-2 font-black tabular-nums tracking-[0.4em] outline-none`}
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
          placeholder="••••"
        />
      </FieldLabel>

      {error ? (
        <div
          className={`${TYPO.caption} rounded-[10px] px-3 py-2`}
          style={{
            background: `${LEGACY_COLORS.red as string}18`,
            color: LEGACY_COLORS.red as string,
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[14px] border py-3 font-bold"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          취소
        </button>
        <PrimaryActionButton
          label="수정 적용"
          intent="primary"
          onClick={submit}
          disabled={busy}
          loadingText="처리 중…"
          className="flex-[1.5]"
        />
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
