"use client";

/**
 * 거래 정정 통합 모달 — 정보(메타) 수정 + 수량 보정을 한 화면에서.
 * 기존 TransactionEditModal / TransactionQuantityCorrectModal 을 흡수(2차 #2: UI 통합).
 * 백엔드는 그대로 2엔드포인트(metaEdit / quantityCorrect). 변경된 영역만 호출.
 *
 * 작업자 식별용 PIN — 실제 보안 인증이 아님.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
                <ProducedByCombobox
                  employees={employees}
                  value={producedBy}
                  onChange={setProducedBy}
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
                  type="text"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v);
                  }}
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
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                정정 사유 <span style={{ color: LEGACY_COLORS.red }}>(필수)</span>
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="왜 정정하는지 짧게 입력"
                className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </div>
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

/** 담당자(produced_by) 자동완성 — 직원 마스터에서 이름 선택, 빈 값 허용. */
function ProducedByCombobox({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name, "ko-KR")),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  /* 기존 값이 마스터에 없는 옛 이름인지 */
  const isLegacyValue =
    value.trim() !== "" && !employees.some((e) => e.name === value);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current
      .querySelector<HTMLLIElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx]);

  function commit(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIdx]) {
        e.preventDefault();
        commit(filtered[activeIdx].name);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  /* 표시값: 드롭다운 열리면 query, 닫히면 선택된 이름 */
  const displayValue = open ? query : value;

  const noMatch = open && query.trim() !== "" && filtered.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIdx] ? `${listId}-opt-${activeIdx}` : undefined
        }
        autoComplete="off"
        placeholder="이름 또는 부서 검색"
        value={displayValue}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={handleKey}
        className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: open ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
      {/* 기존 자유 텍스트 값 경고 */}
      {isLegacyValue && !open && (
        <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.yellow }}>
          직원 마스터에 없는 이름입니다. 변경 시 목록에서 다시 선택하세요.
        </p>
      )}
      {/* 검색 후 결과 없음 안내 */}
      {noMatch && (
        <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          직원 마스터에 없는 이름입니다. 관리자에게 직원 등록을 요청하세요.
        </p>
      )}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-48 overflow-y-auto rounded-[14px] border py-1.5"
          style={{
            background: "var(--c-popup-bg)",
            borderColor: LEGACY_COLORS.border,
            boxShadow: "var(--c-popup-shadow)",
          }}
        >
          {filtered.map((emp, idx) => {
            const isActive = idx === activeIdx;
            const isSelected = emp.name === value;
            return (
              <li
                key={emp.employee_id}
                id={`${listId}-opt-${idx}`}
                data-idx={idx}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => commit(emp.name)}
                className="mx-1 flex cursor-pointer items-center justify-between rounded-[10px] px-3 py-2 text-sm font-bold transition-colors"
                style={{
                  background: isActive
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`
                    : isSelected
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : "transparent",
                  color: isSelected ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
                }}
              >
                <span>{emp.name}</span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {emp.department}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
