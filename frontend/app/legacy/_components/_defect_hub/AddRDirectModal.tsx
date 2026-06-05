"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { itemsApi } from "@/lib/api/items";
import type { Item } from "@/lib/api/types";
import { ReasonFormFields } from "./ReasonFormFields";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

/** mes_code 2번째 segment(공정코드, 2글자)의 끝글자가 R(원자재)인지.
 *  예: 3-AR-0014 → "AR" → 원자재. R 바로 폐기/반품 대상 필터. */
function isRItem(mesCode: string | null | undefined): boolean {
  if (!mesCode) return false;
  const parts = mesCode.split("-");
  return parts.length >= 2 && parts[1].endsWith("R");
}

export interface AddRDirectModalProps {
  open: boolean;
  /** "scrap" → scrap_normal, "return" → return_normal */
  mode: "scrap" | "return";
  onClose: () => void;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

/**
 * R(원자재) 정상 재고 바로 폐기/반품 모달.
 * 격리를 거치지 않고 정상(창고/부서) 재고에서 곧장 처리한다.
 * 제출: stockRequestsApi.createStockRequest({ request_type: "scrap_normal" | "return_normal", ... })
 * → 백엔드가 즉시 처리(COMPLETED).
 */
export function AddRDirectModal({
  open,
  mode,
  onClose,
  currentEmployee,
  onSubmitted,
}: AddRDirectModalProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);

  const [source, setSource] = useState<SourceKind>("warehouse");
  const [dept, setDept] = useState<string>(
    PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
      ? currentEmployee.department
      : PRODUCTION_LINES[0],
  );

  const [qty, setQty] = useState<string>("");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 모달 열릴 때 폼 초기화
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(null);
    setSource("warehouse");
    setDept(
      PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
        ? currentEmployee.department
        : PRODUCTION_LINES[0],
    );
    setQty("");
    setCategory("");
    setMemo("");
    setError(null);
    setBusy(false);
  }, [open, currentEmployee.department]);

  // 품목 검색 (debounced 200ms) — R 품목만 노출.
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      setSearching(true);
      itemsApi
        .getItems({ search: query.trim(), limit: 20 }, { signal: ctrl.signal })
        .then((items) => {
          if (!ctrl.signal.aborted) setResults(items.filter((it) => isRItem(it.mes_code)).slice(0, 8));
        })
        .catch((err) => {
          if (err?.name !== "AbortError" && !ctrl.signal.aborted) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!busy && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onClose]);

  // 선택 품목의 출처별 가용 재고.
  const available = useMemo(() => {
    if (!selected) return 0;
    if (source === "warehouse") return Number(selected.warehouse_qty) || 0;
    const loc = (selected.locations ?? []).find(
      (l) => l.department === dept && l.status === "PRODUCTION",
    );
    return Number(loc?.quantity) || 0;
  }, [selected, source, dept]);

  const qtyNum = useMemo(() => Number(qty), [qty]);
  const canSubmit =
    !busy &&
    selected !== null &&
    Boolean(category) &&
    qtyNum > 0 &&
    Number.isFinite(qtyNum) &&
    qtyNum <= available;

  async function handleSubmit() {
    if (!canSubmit || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await stockRequestsApi.createStockRequest({
        requester_employee_id: currentEmployee.employee_id,
        request_type: mode === "scrap" ? "scrap_normal" : "return_normal",
        reason_category: category,
        reason_memo: memo || null,
        notes: memo || null,
        lines: [
          {
            item_id: selected.item_id,
            quantity: qtyNum,
            from_bucket: source === "warehouse" ? "warehouse" : "production",
            // 창고 출처는 부서 무관(null), 부서 출처는 선택 부서.
            from_department: source === "warehouse"
              ? null
              : (dept as Parameters<typeof stockRequestsApi.createStockRequest>[0]["lines"][0]["from_department"]),
            to_bucket: "none",
          },
        ],
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

  const title = mode === "scrap" ? "R 바로 폐기" : "R 바로 반품";
  const subtitle =
    mode === "scrap"
      ? "정상 재고의 원자재를 격리 없이 즉시 폐기합니다."
      : "정상 재고의 원자재를 격리 없이 즉시 공급처 반품합니다.";

  return createPortal(
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] rounded-[24px] border p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-1 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <div>
            <div id={titleId} className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              {title}
            </div>
            <div className="mt-0.5 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {subtitle} 즉시 처리 (결재 불필요).
            </div>
          </div>
        </div>

        <hr className="my-4" style={{ borderColor: LEGACY_COLORS.border }} />

        {/* 품목 검색 (R 품목만) */}
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            원자재(R) 품목 <span className="text-red-500">*</span>
          </label>
          {selected ? (
            <div
              className="flex items-center justify-between rounded-[10px] border px-3 py-2"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selected.mes_code ?? "(코드 없음)"}
                </span>
                <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selected.item_name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
                className="text-xs font-black hover:underline"
                style={{ color: LEGACY_COLORS.red }}
              >
                변경
              </button>
            </div>
          ) : (
            <div className="relative">
              <div
                className="flex items-center gap-2 rounded-[10px] border px-3 py-2"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="원자재 코드 또는 이름 검색"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                  style={{ color: LEGACY_COLORS.text }}
                  autoFocus
                />
                {searching && (
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                    검색 중...
                  </span>
                )}
              </div>
              {results.length > 0 && (
                <ul
                  className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-[10px] border shadow-lg"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  {results.map((it) => (
                    <li key={it.item_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(it);
                          setResults([]);
                          setQuery("");
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:brightness-95"
                        style={{ background: LEGACY_COLORS.s1 }}
                      >
                        <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                          {it.mes_code ?? "(코드 없음)"}
                        </span>
                        <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                          {it.item_name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && !searching && results.length === 0 && (
                <div className="mt-1 px-1 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                  검색 결과 중 원자재(R) 품목이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 출처 + 부서 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
              출처 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col gap-1.5">
              {(["warehouse", "production"] as SourceKind[]).map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] border px-2 py-1.5"
                  style={{
                    background:
                      source === s
                        ? `color-mix(in srgb, ${LEGACY_COLORS.red} 6%, ${LEGACY_COLORS.s2})`
                        : LEGACY_COLORS.s2,
                    borderColor: source === s ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                  }}
                >
                  <input
                    type="radio"
                    name="r-direct-source"
                    value={s}
                    checked={source === s}
                    onChange={() => setSource(s)}
                    className="accent-red-500"
                  />
                  <span className="text-xs font-black" style={{ color: LEGACY_COLORS.text }}>
                    {s === "warehouse" ? "창고 재고" : "부서 재고"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
              {source === "warehouse" ? "창고 (부서 무관)" : "출처 부서"}{" "}
              {source === "production" && <span className="text-red-500">*</span>}
            </label>
            <select
              value={dept}
              disabled={source === "warehouse"}
              onChange={(e) => setDept(e.target.value)}
              className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none disabled:opacity-50"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              {PRODUCTION_LINES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {selected && (
              <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                가용 {available}개
              </span>
            )}
          </div>
        </div>

        {/* 수량 */}
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            수량 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min={0}
            step="1"
            placeholder="예: 3"
            className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: qtyNum > available ? "#ef4444" : LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
          {selected && qtyNum > available && (
            <span className="text-xs font-bold text-red-500">가용 재고({available}개)를 초과했습니다.</span>
          )}
        </div>

        <hr className="mb-4" style={{ borderColor: LEGACY_COLORS.border }} />

        {/* 사유 폼 */}
        <ReasonFormFields
          category={category}
          memo={memo}
          onCategoryChange={setCategory}
          onMemoChange={setMemo}
          required
        />

        {/* 에러 */}
        {error && (
          <div
            className="mt-3 rounded-[10px] border px-3 py-2 text-xs font-bold text-red-700"
            style={{ background: "#fef2f2", borderColor: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            style={{ background: LEGACY_COLORS.red }}
          >
            {busy ? "처리 중..." : mode === "scrap" ? "즉시 폐기 →" : "즉시 반품 →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
