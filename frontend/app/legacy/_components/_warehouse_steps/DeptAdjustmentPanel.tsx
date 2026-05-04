"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown, ChevronsRight, Plus, Trash2, AlertTriangle,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import type {
  AdjDirection,
  AdjLineInput,
  AdjLineTemplate,
  DeptAdjSubType,
} from "@/lib/api/types/dept-adjustment";
import type { Department, Item } from "@/lib/api";
import { PROD_DEPTS } from "./_constants";
import { SettingLabel } from "./_atoms";

// ──────────────────────── 상수 ────────────────────────

const SUB_TYPE_LABELS: Record<DeptAdjSubType, string> = {
  production:  "생산/조립",
  disassembly: "분해/회수",
  correction:  "수량 보정",
};

const DIRECTION_LABELS: Record<AdjDirection, string> = {
  in:        "입고",
  out:       "출고",
  defective: "불량",
  scrap:     "폐기",
};

const DIRECTION_COLORS: Record<AdjDirection, string> = {
  in:        LEGACY_COLORS.green ?? "#22c55e",
  out:       LEGACY_COLORS.blue,
  defective: LEGACY_COLORS.red,
  scrap:     LEGACY_COLORS.muted2,
};

// 편집 가능한 라인 (AdjLineTemplate + 고유 key)
interface AdjRow extends AdjLineTemplate {
  _key: string;
}

let _keyCounter = 0;
function newKey(): string {
  return `row-${++_keyCounter}`;
}

function templateToRow(t: AdjLineTemplate): AdjRow {
  return { ...t, _key: newKey() };
}

// ──────────────────────── 품목 검색 인풋 ────────────────────────

function ItemSearchInput({
  items,
  value,
  onChange,
  placeholder = "품목 검색...",
}: {
  items: Item[];
  value: string;
  onChange: (itemId: string, item: Item) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const found = items.filter((i) => {
    const hay = `${i.erp_code ?? ""} ${i.item_name}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }).slice(0, 30);

  const selected = items.find((i) => i.item_id === value);

  return (
    <div className="relative">
      <input
        type="text"
        value={q || selected?.item_name || ""}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setQ("")}
        placeholder={placeholder}
        className="w-full rounded-[10px] border px-2.5 py-1.5 text-xs outline-none"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      />
      {q && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-[10px] border shadow-lg overflow-auto"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, maxHeight: 200 }}
        >
          {found.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>검색 결과 없음</div>
          )}
          {found.map((item) => (
            <button
              key={item.item_id}
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs hover:brightness-110"
              style={{ color: LEGACY_COLORS.text }}
              onClick={() => { onChange(item.item_id, item); setQ(""); }}
            >
              <span className="font-semibold">{item.erp_code}</span>{" "}
              <span style={{ color: LEGACY_COLORS.muted2 }}>{item.item_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────── AdjLinesTable ────────────────────────

function AdjLinesTable({
  rows,
  subType,
  onChangeDirection,
  onChangeQty,
  onChangeReason,
  onExpand,
  onRemove,
  loadingExpandKey,
}: {
  rows: AdjRow[];
  subType: DeptAdjSubType;
  onChangeDirection: (key: string, dir: AdjDirection) => void;
  onChangeQty: (key: string, qty: number) => void;
  onChangeReason: (key: string, reason: string) => void;
  onExpand: (key: string, row: AdjRow) => void;
  onRemove: (key: string) => void;
  loadingExpandKey: string | null;
}) {
  const availableDirections: AdjDirection[] =
    subType === "disassembly"
      ? ["in", "defective", "scrap"]
      : subType === "correction"
        ? ["in", "out"]
        : ["in", "out"];

  if (rows.length === 0) {
    return (
      <div
        className="rounded-[12px] border px-4 py-6 text-center text-xs"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        BOM 불러오기 또는 품목을 추가해 주세요.
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: LEGACY_COLORS.border }}>
      {/* 헤더 */}
      <div
        className="grid text-[9px] font-bold uppercase tracking-widest px-3 py-1.5"
        style={{
          background: LEGACY_COLORS.s2,
          color: LEGACY_COLORS.muted2,
          gridTemplateColumns: "80px 1fr 72px 80px auto",
        }}
      >
        <span>방향</span>
        <span>품목</span>
        <span className="text-right">BOM기대</span>
        <span className="text-right">수량</span>
        <span />
      </div>

      {rows.map((row) => {
        const showReason = subType === "correction" || row.direction === "scrap";
        return (
          <div
            key={row._key}
            className="grid items-center gap-x-2 border-t px-3 py-2"
            style={{
              borderColor: LEGACY_COLORS.border,
              gridTemplateColumns: "80px 1fr 72px 80px auto",
            }}
          >
            {/* 방향 선택 */}
            <div className="relative">
              <select
                value={row.direction}
                onChange={(e) => onChangeDirection(row._key, e.target.value as AdjDirection)}
                className="w-full appearance-none rounded-[8px] border px-1.5 py-1 pr-5 text-[11px] font-bold outline-none"
                style={{
                  background: `color-mix(in srgb, ${DIRECTION_COLORS[row.direction]} 14%, transparent)`,
                  borderColor: DIRECTION_COLORS[row.direction],
                  color: DIRECTION_COLORS[row.direction],
                }}
              >
                {availableDirections.map((d) => (
                  <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
                ))}
                {/* 기존 direction이 목록 밖이면 추가 */}
                {!availableDirections.includes(row.direction) && (
                  <option value={row.direction}>{DIRECTION_LABELS[row.direction]}</option>
                )}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2"
                style={{ color: DIRECTION_COLORS[row.direction] }}
              />
            </div>

            {/* 품목명 */}
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
                {row.item_name || row.item_id}
              </div>
              {row.erp_code && (
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{row.erp_code}</div>
              )}
              {showReason && (
                <input
                  type="text"
                  value={row.reason ?? ""}
                  onChange={(e) => onChangeReason(row._key, e.target.value)}
                  placeholder="사유 입력..."
                  className="mt-0.5 w-full rounded-[6px] border px-1.5 py-0.5 text-[10px] outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              )}
            </div>

            {/* BOM 기대 */}
            <div className="text-right text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {row.bom_expected != null ? row.bom_expected.toFixed(2) : "—"}
            </div>

            {/* 수량 */}
            <input
              type="number"
              min={0.0001}
              step="any"
              value={row.quantity}
              onChange={(e) => onChangeQty(row._key, parseFloat(e.target.value) || 0)}
              className="w-full rounded-[8px] border px-2 py-1 text-right text-xs font-bold outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />

            {/* 전개 + 삭제 */}
            <div className="flex gap-1">
              {row.has_children && (
                <button
                  type="button"
                  title="BOM 전개"
                  onClick={() => onExpand(row._key, row)}
                  disabled={loadingExpandKey === row._key}
                  className="rounded-[6px] border p-1 hover:brightness-110 disabled:opacity-50"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
                >
                  <ChevronsRight className="h-3 w-3" style={{ color: LEGACY_COLORS.blue }} />
                </button>
              )}
              <button
                type="button"
                title="라인 제거"
                onClick={() => onRemove(row._key)}
                className="rounded-[6px] border p-1 hover:brightness-110"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                <Trash2 className="h-3 w-3" style={{ color: LEGACY_COLORS.red }} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────── 메인 패널 ────────────────────────

export function DeptAdjustmentPanel({
  items,
  operator,
  onSuccess,
  onError,
}: {
  items: Item[];
  operator: { name?: string; department?: Department } | null;
  onSuccess: (count: number, label: string) => void;
  onError: (msg: string) => void;
}) {
  const [subType, setSubType] = useState<DeptAdjSubType>("production");
  const [dept, setDept] = useState<Department>(
    (operator?.department && PROD_DEPTS.includes(operator.department as Department)
      ? operator.department
      : "조립") as Department,
  );
  const [rows, setRows] = useState<AdjRow[]>([]);
  const [notes, setNotes] = useState("");

  // 생산/분해용 결과품 선택 상태
  const [targetItemId, setTargetItemId] = useState("");
  const [targetQty, setTargetQty] = useState<number>(1);

  const [loadingBom, setLoadingBom] = useState(false);
  const [loadingExpandKey, setLoadingExpandKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ─── 핸들러 ───

  const handleSubTypeChange = useCallback((st: DeptAdjSubType) => {
    setSubType(st);
    setRows([]);
    setTargetItemId("");
    setTargetQty(1);
  }, []);

  const handleLoadBom = useCallback(async () => {
    if (!targetItemId) return;
    setLoadingBom(true);
    try {
      const res = await deptAdjustmentApi.getBomTemplate(targetItemId, subType, targetQty);
      setRows(res.lines.map((l) => templateToRow({ ...l, department: dept })));
    } catch (e) {
      onError((e as Error).message ?? "BOM 불러오기 실패");
    } finally {
      setLoadingBom(false);
    }
  }, [targetItemId, subType, targetQty, dept, onError]);

  const handleExpand = useCallback(async (key: string, row: AdjRow) => {
    setLoadingExpandKey(key);
    try {
      const expanded = await deptAdjustmentApi.expandComponent({
        item_id: row.item_id,
        quantity: row.quantity,
        department: dept,
        direction: row.direction === "in" ? "in" : "out",
      });
      setRows((prev) => {
        const idx = prev.findIndex((r) => r._key === key);
        if (idx === -1) return prev;
        const newRows = [...prev];
        newRows.splice(idx, 1, ...expanded.map((l) => templateToRow({ ...l, department: dept })));
        return newRows;
      });
    } catch (e) {
      onError((e as Error).message ?? "전개 실패");
    } finally {
      setLoadingExpandKey(null);
    }
  }, [dept, onError]);

  const addEmptyRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      templateToRow({
        item_id: "",
        item_name: "",
        erp_code: null,
        process_type_code: null,
        unit: "EA",
        direction: subType === "correction" ? "in" : "out",
        quantity: 1,
        bom_expected: null,
        has_children: false,
        department: dept,
        reason: null,
      }),
    ]);
  }, [subType, dept]);

  const handlePickCorrectionItem = useCallback((key: string, itemId: string, item: Item) => {
    setRows((prev) =>
      prev.map((r) =>
        r._key === key
          ? { ...r, item_id: itemId, item_name: item.item_name, erp_code: item.erp_code ?? null }
          : r,
      ),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    const validRows = rows.filter((r) => r.item_id && r.quantity > 0);
    if (validRows.length === 0) {
      onError("처리할 라인이 없습니다. 품목과 수량을 입력하세요.");
      return;
    }

    const lines: AdjLineInput[] = validRows.map((r) => ({
      item_id: r.item_id,
      direction: r.direction,
      quantity: r.quantity,
      department: dept,
      reason: r.reason || null,
      bom_expected: r.bom_expected ?? null,
    }));

    setSubmitting(true);
    try {
      const result = await deptAdjustmentApi.submitAdjustment({
        sub_type: subType,
        lines,
        operator_name: operator?.name ?? null,
        notes: notes || null,
      });
      setRows([]);
      setTargetItemId("");
      setTargetQty(1);
      setNotes("");
      onSuccess(result.processed_count, SUB_TYPE_LABELS[subType]);
    } catch (e) {
      onError((e as Error).message ?? "처리 실패");
    } finally {
      setSubmitting(false);
    }
  }, [rows, dept, subType, operator, notes, onSuccess, onError]);

  // ─── 렌더 ───

  const canSubmit = rows.some((r) => r.item_id && r.quantity > 0);

  return (
    <div className="space-y-5 pb-4">

      {/* 세부 유형 선택 */}
      <div>
        <SettingLabel label="세부 유형" />
        <div className="grid grid-cols-3 gap-2">
          {(["production", "disassembly", "correction"] as DeptAdjSubType[]).map((st) => {
            const active = st === subType;
            return (
              <button
                key={st}
                type="button"
                onClick={() => handleSubTypeChange(st)}
                className="rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                style={{
                  background: active ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)` : LEGACY_COLORS.s2,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {SUB_TYPE_LABELS[st]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 부서 선택 */}
      <div>
        <SettingLabel label="대상 부서" />
        <div className="grid grid-cols-6 gap-2">
          {PROD_DEPTS.map((d) => {
            const active = d === dept;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDept(d)}
                className="rounded-[12px] border px-1 py-2 text-sm font-bold transition-all hover:brightness-110"
                style={{
                  background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s2,
                  borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                  color: active ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* 생산/조립 · 분해/회수: 결과/대상품 선택 + BOM 불러오기 */}
      {(subType === "production" || subType === "disassembly") && (
        <div>
          <SettingLabel label={subType === "production" ? "결과 품목" : "분해 대상 품목"} />
          <div className="flex gap-2">
            <div className="flex-1">
              <ItemSearchInput
                items={items}
                value={targetItemId}
                onChange={(id) => setTargetItemId(id)}
                placeholder={subType === "production" ? "생산할 품목 검색..." : "분해할 품목 검색..."}
              />
            </div>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={targetQty}
              onChange={(e) => setTargetQty(parseFloat(e.target.value) || 1)}
              placeholder="수량"
              className="w-20 rounded-[10px] border px-2 py-1.5 text-right text-xs font-bold outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            <button
              type="button"
              onClick={handleLoadBom}
              disabled={!targetItemId || loadingBom}
              className="shrink-0 rounded-[10px] border px-3 py-1.5 text-xs font-bold transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                borderColor: LEGACY_COLORS.blue,
                color: LEGACY_COLORS.blue,
              }}
            >
              {loadingBom ? "..." : "BOM 불러오기"}
            </button>
          </div>
        </div>
      )}

      {/* 수량 보정: 라인 수동 추가 */}
      {subType === "correction" && (
        <div className="flex items-center justify-between">
          <SettingLabel label="조정 품목" />
          <button
            type="button"
            onClick={addEmptyRow}
            className="flex items-center gap-1 rounded-[8px] border px-2 py-1 text-xs font-semibold hover:brightness-110"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.blue,
            }}
          >
            <Plus className="h-3 w-3" />
            품목 추가
          </button>
        </div>
      )}

      {/* 라인 테이블 */}
      {subType === "correction" && rows.length > 0 ? (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={row._key}
              className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
            >
              {/* 방향 */}
              <select
                value={row.direction}
                onChange={(e) => {
                  const dir = e.target.value as AdjDirection;
                  setRows((prev) => prev.map((r) => r._key === row._key ? { ...r, direction: dir } : r));
                }}
                className="shrink-0 appearance-none rounded-[8px] border px-1.5 py-1 text-[11px] font-bold outline-none"
                style={{
                  background: `color-mix(in srgb, ${DIRECTION_COLORS[row.direction]} 14%, transparent)`,
                  borderColor: DIRECTION_COLORS[row.direction],
                  color: DIRECTION_COLORS[row.direction],
                  width: 60,
                }}
              >
                {(["in", "out"] as AdjDirection[]).map((d) => (
                  <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
                ))}
              </select>

              {/* 품목 선택 */}
              <div className="flex-1">
                <ItemSearchInput
                  items={items}
                  value={row.item_id}
                  onChange={(id, item) => handlePickCorrectionItem(row._key, id, item)}
                  placeholder="품목 선택..."
                />
              </div>

              {/* 수량 */}
              <input
                type="number"
                min={0.0001}
                step="any"
                value={row.quantity}
                onChange={(e) => {
                  const q = parseFloat(e.target.value) || 0;
                  setRows((prev) => prev.map((r) => r._key === row._key ? { ...r, quantity: q } : r));
                }}
                className="w-16 rounded-[8px] border px-2 py-1 text-right text-xs font-bold outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />

              {/* 사유 */}
              <input
                type="text"
                value={row.reason ?? ""}
                onChange={(e) => {
                  const r = e.target.value;
                  setRows((prev) => prev.map((row2) => row2._key === row._key ? { ...row2, reason: r } : row2));
                }}
                placeholder="사유..."
                className="w-28 rounded-[8px] border px-2 py-1 text-xs outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />

              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((r) => r._key !== row._key))}
                className="rounded-[6px] border p-1"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                <Trash2 className="h-3 w-3" style={{ color: LEGACY_COLORS.red }} />
              </button>
            </div>
          ))}
        </div>
      ) : (subType !== "correction") ? (
        <AdjLinesTable
          rows={rows}
          subType={subType}
          onChangeDirection={(key, dir) =>
            setRows((prev) => prev.map((r) => r._key === key ? { ...r, direction: dir } : r))
          }
          onChangeQty={(key, qty) =>
            setRows((prev) => prev.map((r) => r._key === key ? { ...r, quantity: qty } : r))
          }
          onChangeReason={(key, reason) =>
            setRows((prev) => prev.map((r) => r._key === key ? { ...r, reason } : r))
          }
          onExpand={handleExpand}
          onRemove={(key) => setRows((prev) => prev.filter((r) => r._key !== key))}
          loadingExpandKey={loadingExpandKey}
        />
      ) : null}

      {/* 메모 */}
      <div>
        <SettingLabel label="메모 (선택)" />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="작업 메모..."
          className="w-full rounded-[10px] border px-3 py-1.5 text-xs outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      {/* 제출 버튼 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full rounded-[12px] border py-3 text-sm font-bold transition-all hover:brightness-110 disabled:opacity-40"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
          borderColor: LEGACY_COLORS.blue,
          color: LEGACY_COLORS.blue,
        }}
      >
        {submitting ? "처리 중..." : `${SUB_TYPE_LABELS[subType]} 처리`}
      </button>

      {/* 안내 */}
      <div
        className="flex items-start gap-1.5 rounded-[10px] border px-3 py-2 text-[11px]"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>부서 재고 조정은 즉시 처리됩니다. 창고 재고가 필요한 경우 먼저 <strong>창고 ↔ 부서 이동</strong>을 사용하세요.</span>
      </div>
    </div>
  );
}
