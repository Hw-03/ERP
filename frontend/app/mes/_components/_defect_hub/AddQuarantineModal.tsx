"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMyItemOrderQuery } from "@/lib/queries/useMyItemOrderQuery";
import { buildEmployeeOrderRank } from "../_warehouse_v2/itemPickerShared";
import { createPortal } from "react-dom";
import { AlertTriangle, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { defectsApi } from "@/lib/api/defects";
import { itemsApi } from "@/lib/api/items";
import type { Item } from "@/lib/api/types";
import { ReasonFormFields } from "./ReasonFormFields";
import { InlineErrorNote } from "./InlineErrorNote";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

export interface AddQuarantineModalProps {
  open: boolean;
  onClose: () => void;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

/**
 * 새 격리 추가 모달.
 *
 * 입력:
 *   - 품목 검색 (mes_code / item_name)
 *   - 출처: 창고 재고 OR 부서 재고 (라디오)
 *     · 창고 재고 → target_dept select (어느 부서로 격리할지)
 *     · 부서 재고 → source_dept select (= target_dept 자동, 같은 부서 안에서 격리)
 *   - 수량 + 사유 카테고리/메모
 *
 * 제출: defectsApi.quarantine (즉시, 결재 불필요).
 */
export function AddQuarantineModal({
  open,
  onClose,
  currentEmployee,
  onSubmitted,
}: AddQuarantineModalProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);

  const [source, setSource] = useState<SourceKind>("warehouse");
  // warehouse 모드: target_dept 만 선택. production 모드: source_dept = target_dept.
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

  // 품목 검색 (debounced 200ms)
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
        .getItems({ search: query.trim(), limit: 8 }, { signal: ctrl.signal })
        .then((items) => {
          if (!ctrl.signal.aborted) setResults(items);
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

  const { data: myOrderData } = useMyItemOrderQuery(currentEmployee.employee_id);
  const employeeOrderRank = useMemo(
    () => buildEmployeeOrderRank(myOrderData),
    [myOrderData],
  );

  const sortedResults = useMemo(() => {
    if (employeeOrderRank.size === 0) return results;
    return [...results].sort((a, b) => {
      const ra = employeeOrderRank.get(a.item_id) ?? Number.POSITIVE_INFINITY;
      const rb = employeeOrderRank.get(b.item_id) ?? Number.POSITIVE_INFINITY;
      return ra - rb;
    });
  }, [results, employeeOrderRank]);

  const qtyNum = useMemo(() => Number(qty), [qty]);
  const canSubmit =
    !busy &&
    selected !== null &&
    Boolean(category) &&
    qtyNum > 0 &&
    Number.isFinite(qtyNum);

  async function handleSubmit() {
    if (!canSubmit || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await defectsApi.quarantine({
        item_id: selected.item_id,
        qty: qtyNum,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: dept,
        reason_category: category,
        reason_memo: memo,
        actor_employee_id: currentEmployee.employee_id,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "격리 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

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
              새 불량 추가
            </div>
            <div className="mt-0.5 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              정상 재고에서 불량 항목을 격리합니다. 즉시 처리 (결재 불필요).
            </div>
          </div>
        </div>

        <hr className="my-4" style={{ borderColor: LEGACY_COLORS.border }} />

        {/* 품목 검색 */}
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            품목 <span style={{ color: LEGACY_COLORS.red }}>*</span>
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
              <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="품목 코드 또는 이름 검색"
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
              {sortedResults.length > 0 && (
                <ul
                  className="absolute z-10 mt-1 max-h-[200px] w-full overflow-auto rounded-[10px] border shadow-lg"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  {sortedResults.map((it) => (
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
            </div>
          )}
        </div>

        {/* 출처 + 부서 */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
              격리 출처 <span style={{ color: LEGACY_COLORS.red }}>*</span>
            </label>
            <div className="flex flex-col gap-1.5">
              {(["warehouse", "production"] as SourceKind[]).map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] border px-2 py-1.5"
                  style={{
                    background: source === s ? `color-mix(in srgb, ${LEGACY_COLORS.red} 6%, ${LEGACY_COLORS.s2})` : LEGACY_COLORS.s2,
                    borderColor: source === s ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                  }}
                >
                  <input
                    type="radio"
                    name="quarantine-source"
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
              {source === "warehouse" ? "격리 부서" : "출처/격리 부서"} <span style={{ color: LEGACY_COLORS.red }}>*</span>
            </label>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none"
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
            {source === "production" && (
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                선택한 부서의 정상 재고에서 같은 부서 [불량]으로 이동
              </span>
            )}
            {source === "warehouse" && (
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                창고에서 차감 후 선택한 부서 [불량]으로 격리
              </span>
            )}
          </div>
        </div>

        {/* 수량 */}
        <div className="mb-4 flex flex-col gap-1">
          <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            격리 수량 <span style={{ color: LEGACY_COLORS.red }}>*</span>
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min={0}
            step="0.01"
            placeholder="예: 3"
            className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
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
        {error && <InlineErrorNote className="mt-3">{error}</InlineErrorNote>}

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
            {busy ? "처리 중..." : "격리하기 →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
