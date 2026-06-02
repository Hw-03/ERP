"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { DefectItemPicker } from "./DefectItemPicker";
import { ReasonFormFields } from "./ReasonFormFields";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

/** add = 새 불량 격리 / r-scrap·r-return = R 정상재고 바로 폐기·반품. */
export type DefectCartMode = "add" | "r-scrap" | "r-return";

interface CartLine {
  key: string;
  item: Item;
  qty: string;
  category: string;
  memo: string;
}

interface LineFailure {
  key: string;
  itemName: string;
  message: string;
}

interface Props {
  mode: DefectCartMode;
  items: Item[];
  productModels: ProductModel[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}

const TITLES: Record<DefectCartMode, { title: string; subtitle: string; submit: string }> = {
  add: {
    title: "새 불량 추가",
    subtitle: "정상 재고에서 여러 품목을 골라 한 번에 격리합니다. 즉시 처리.",
    submit: "격리하기",
  },
  "r-scrap": {
    title: "R 바로 폐기",
    subtitle: "원자재(R) 정상 재고를 격리 없이 즉시 폐기합니다. 즉시 처리.",
    submit: "즉시 폐기",
  },
  "r-return": {
    title: "R 바로 반품",
    subtitle: "원자재(R) 정상 재고를 격리 없이 즉시 공급처 반품합니다. 즉시 처리.",
    submit: "즉시 반품",
  },
};

/**
 * 불량 탭 전폭 작업 흐름 — 새 불량 추가 / R 바로 폐기·반품.
 * 상단에서 출처(창고/부서)+부서 1회 선택 → DefectItemPicker 로 여러 품목 담기 →
 * 장바구니 줄마다 수량 + 품목별 사유 → 제출 시 줄마다 단건 API 루프(Promise.allSettled).
 */
export function DefectCartFlow({
  mode,
  items,
  productModels,
  currentEmployee,
  onDone,
  onCancel,
}: Props) {
  const rOnly = mode !== "add";
  const meta = TITLES[mode];

  const [source, setSource] = useState<SourceKind>("warehouse");
  const [dept, setDept] = useState<string>(
    PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
      ? currentEmployee.department
      : PRODUCTION_LINES[0],
  );
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<LineFailure[]>([]);

  const selectedIds = useMemo(() => new Set(lines.map((l) => l.item.item_id)), [lines]);

  function addItem(item: Item) {
    setLines((prev) =>
      prev.some((l) => l.item.item_id === item.item_id)
        ? prev
        : [...prev, { key: `${item.item_id}-${Date.now()}`, item, qty: "", category: "", memo: "" }],
    );
  }

  function updateLine(key: string, patch: Partial<Omit<CartLine, "key" | "item">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function copyReasonDown(index: number) {
    setLines((prev) => {
      const src = prev[index];
      if (!src) return prev;
      return prev.map((l, i) =>
        i > index ? { ...l, category: src.category, memo: src.memo } : l,
      );
    });
  }

  const allValid =
    lines.length > 0 &&
    lines.every((l) => {
      const n = Number(l.qty);
      return Number.isFinite(n) && n > 0 && Boolean(l.category);
    });

  async function submitLine(line: CartLine): Promise<void> {
    const qty = Number(line.qty);
    if (mode === "add") {
      await defectsApi.quarantine({
        item_id: line.item.item_id,
        qty,
        source,
        source_dept: source === "production" ? dept : undefined,
        target_dept: dept,
        reason_category: line.category,
        reason_memo: line.memo,
        actor_employee_id: currentEmployee.employee_id,
      });
      return;
    }
    await stockRequestsApi.createStockRequest({
      requester_employee_id: currentEmployee.employee_id,
      request_type: mode === "r-scrap" ? "scrap_normal" : "return_normal",
      reason_category: line.category,
      reason_memo: line.memo || null,
      notes: line.memo || null,
      lines: [
        {
          item_id: line.item.item_id,
          quantity: qty,
          from_bucket: source === "warehouse" ? "warehouse" : "production",
          from_department: source === "warehouse" ? null : (dept as Department),
          to_bucket: "none",
        },
      ],
    });
  }

  async function handleSubmit() {
    if (!allValid || busy) return;
    setBusy(true);
    setFailures([]);
    const results = await Promise.allSettled(lines.map((l) => submitLine(l)));
    const nextFailures: LineFailure[] = [];
    const failedKeys = new Set<string>();
    results.forEach((res, i) => {
      if (res.status === "rejected") {
        const line = lines[i];
        failedKeys.add(line.key);
        nextFailures.push({
          key: line.key,
          itemName: line.item.item_name,
          message: res.reason instanceof Error ? res.reason.message : "처리 실패",
        });
      }
    });
    setBusy(false);
    if (nextFailures.length === 0) {
      onDone();
      return;
    }
    // 성공분은 제거하고 실패분만 남긴다.
    setLines((prev) => prev.filter((l) => failedKeys.has(l.key)));
    setFailures(nextFailures);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          취소
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            {meta.title}
          </h2>
          <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* 출처 + 부서 (1회 공통) */}
      <div
        className="grid shrink-0 grid-cols-[1fr_1fr] gap-3 rounded-[14px] border px-4 py-3"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            출처 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {(["warehouse", "production"] as SourceKind[]).map((s) => (
              <label
                key={s}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-[8px] border px-2 py-1.5"
                style={{
                  background:
                    source === s
                      ? `color-mix(in srgb, ${LEGACY_COLORS.red} 6%, ${LEGACY_COLORS.s1})`
                      : LEGACY_COLORS.s1,
                  borderColor: source === s ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                }}
              >
                <input
                  type="radio"
                  name="defect-cart-source"
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
            {mode === "add"
              ? source === "warehouse"
                ? "격리 부서"
                : "출처/격리 부서"
              : source === "warehouse"
                ? "창고 (부서 무관)"
                : "출처 부서"}{" "}
            {(mode === "add" || source === "production") && <span className="text-red-500">*</span>}
          </label>
          <select
            value={dept}
            disabled={mode !== "add" && source === "warehouse"}
            onChange={(e) => setDept(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2 text-sm font-bold outline-none disabled:opacity-50"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {PRODUCTION_LINES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 본문: 좌 피커 + 우 장바구니 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-h-0">
          <DefectItemPicker
            items={items}
            productModels={productModels}
            rOnly={rOnly}
            targetDepartment={dept}
            selectedIds={selectedIds}
            onAdd={addItem}
          />
        </div>

        {/* 장바구니 */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto rounded-[16px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          <div
            className="sticky top-0 z-10 px-4 py-2 text-xs font-black uppercase tracking-[1.5px]"
            style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            장바구니 {lines.length}건
          </div>
          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
              왼쪽에서 품목을 추가하세요.
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3">
              {lines.map((line, idx) => {
                const fail = failures.find((f) => f.key === line.key);
                return (
                  <div
                    key={line.key}
                    className="flex flex-col gap-2 rounded-[12px] border px-3 py-2"
                    style={{
                      background: LEGACY_COLORS.s1,
                      borderColor: fail ? "#fca5a5" : LEGACY_COLORS.border,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                          {line.item.mes_code ?? "(코드 없음)"}
                        </div>
                        <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                          {line.item.item_name}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="shrink-0 rounded-[8px] p-1.5 transition-colors hover:brightness-110"
                        style={{ color: LEGACY_COLORS.muted2 }}
                        aria-label="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                        수량
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        placeholder="예: 3"
                        className="w-24 rounded-[8px] border px-2 py-1 text-sm font-bold outline-none"
                        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                      />
                      {idx < lines.length - 1 && (line.category || line.memo) && (
                        <button
                          type="button"
                          onClick={() => copyReasonDown(idx)}
                          className="ml-auto flex items-center gap-1 text-[11px] font-bold hover:underline"
                          style={{ color: LEGACY_COLORS.blue }}
                        >
                          <Copy className="h-3 w-3" />
                          위 사유 복사
                        </button>
                      )}
                    </div>

                    <ReasonFormFields
                      category={line.category}
                      memo={line.memo}
                      onCategoryChange={(c) => updateLine(line.key, { category: c })}
                      onMemoChange={(m) => updateLine(line.key, { memo: m })}
                      required
                    />

                    {fail && (
                      <div className="text-xs font-bold text-red-600">실패: {fail.message}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 하단 제출 바 */}
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
        {failures.length > 0 ? (
          <span className="text-xs font-bold text-red-600">
            {failures.length}건 실패 — 남은 줄을 확인 후 다시 제출하세요.
          </span>
        ) : (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            줄마다 수량·사유를 입력하세요.
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!allValid || busy}
          className="rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
          style={{ background: LEGACY_COLORS.red }}
        >
          {busy ? "처리 중..." : `${meta.submit} (${lines.length}건) →`}
        </button>
      </div>
    </div>
  );
}
