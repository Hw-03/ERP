"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Minus, Plus, PackageSearch, ScanLine, Trash2 } from "lucide-react";
import type { Employee, Item } from "@/lib/api";
import { LEGACY_COLORS, normalizeDepartment } from "../../../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { BarcodeScannerModal } from "../../../BarcodeScannerModal";
import type { ToastState } from "@/features/mes/shared/Toast";
import { TYPO } from "../../tokens";
import {
  EmptyState,
  FilterChip,
  FilterChipRow,
  IconButton,
  InlineSearch,
  PersonAvatar,
  PrimaryActionButton,
  SectionCard,
  SectionCardRow,
  StickyFooter,
} from "../../primitives";
import { WAREHOUSE_MODE_META, type WarehouseMode } from "./warehouseWizardConfig";
import { useWarehouseWizard } from "./context";

/* -------------------------------------------------------------------------- */
/* Step 1 — 유형 선택                                                          */
/* -------------------------------------------------------------------------- */

export function StepType() {
  const { state, dispatch } = useWarehouseWizard();
  const current = state.mode as WarehouseMode | null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading title="이 작업의 유형을 결정합니다" hint="선택하면 바로 다음 단계로 넘어갑니다" />
      <div className="flex flex-col gap-2">
        {(Object.keys(WAREHOUSE_MODE_META) as WarehouseMode[]).map((mode) => {
          const meta = WAREHOUSE_MODE_META[mode];
          const Icon = meta.icon;
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_MODE", mode });
                dispatch({ type: "NEXT" });
              }}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: active ? `${LEGACY_COLORS.blue as string}14` : LEGACY_COLORS.s2,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${LEGACY_COLORS.blue as string}22`, color: LEGACY_COLORS.blue }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {meta.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {meta.description}
                </div>
              </div>
              <ChevronRight size={20} color={LEGACY_COLORS.muted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — 담당자 선택                                                        */
/* -------------------------------------------------------------------------- */

export function StepPerson({ employees, loading }: { employees: Employee[]; loading: boolean }) {
  const { state, dispatch } = useWarehouseWizard();

  const grouped = useMemo(() => {
    const map = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const key = normalizeDepartment(e.department);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [employees]);

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <StepHeading title="작업을 진행할 담당자를 선택합니다" hint="담당자를 누르면 바로 다음 단계로 넘어갑니다" />
      {grouped.map(([dept, group]) => (
        <div key={dept} className="flex flex-col gap-2">
          <div className={`${TYPO.caption} font-bold`} style={{ color: LEGACY_COLORS.muted }}>
            {dept}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {group.map((e) => (
              <PersonAvatar
                key={e.employee_id}
                name={e.name}
                department={e.department}
                selected={state.employeeId === e.employee_id}
                onClick={() => {
                  dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                  dispatch({ type: "NEXT" });
                }}
                size="md"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — 품목 / 수량                                                        */
/* -------------------------------------------------------------------------- */

const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
] as const;

export function StepItems({
  items,
  loading,
  onNext,
  showToast,
}: {
  items: Item[];
  loading: boolean;
  onNext: () => void;
  showToast?: (toast: ToastState) => void;
}) {
  const { state, dispatch } = useWarehouseWizard();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof ITEM_CATEGORIES)[number]["id"]>("ALL");
  const [scanOpen, setScanOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (category === "R" && !item.process_type_code?.endsWith("R")) return false;
      if (category === "A" && !item.process_type_code?.endsWith("A")) return false;
      if (category === "F" && !item.process_type_code?.endsWith("F")) return false;
      if (!keyword) return true;
      const haystack = `${item.item_name} ${item.erp_code ?? ""} ${item.barcode ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, category, deferredSearch]);

  const selectedList = useMemo(
    () =>
      Array.from(state.items.entries())
        .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id), qty }))
        .filter((e): e is { item: Item; qty: number } => !!e.item),
    [state.items, items],
  );

  const handleScanned = (raw: string) => {
    const hit = items.find(
      (it) => it.barcode === raw || it.erp_code === raw || it.erp_code?.replace(/^0+/, "") === raw,
    );
    if (!hit) {
      dispatch({ type: "SET_ERROR", error: `스캔 값 ${raw} 에 해당하는 품목을 찾지 못했습니다.` });
      return;
    }
    const current = state.items.get(hit.item_id) ?? 0;
    dispatch({ type: "SET_QTY", itemId: hit.item_id, qty: current + 1 });
    showToast?.({ type: "info", message: `${hit.item_name} +1 (${current + 1})` });
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-28 pt-4">
      <StepHeading title="처리할 품목과 수량을 결정합니다" hint="검색, 바코드 스캔, 카테고리로 빠르게 찾을 수 있습니다" />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <InlineSearch value={search} onChange={setSearch} placeholder="품명 · 코드 · 바코드" />
        </div>
        <IconButton
          icon={ScanLine}
          label="바코드 스캔"
          size="md"
          color={LEGACY_COLORS.blue}
          onClick={() => setScanOpen(true)}
        />
      </div>

      <FilterChipRow>
        {ITEM_CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            label={c.label}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
            color={LEGACY_COLORS.purple}
          />
        ))}
      </FilterChipRow>

      {state.error ? (
        <div
          className={`${TYPO.caption} rounded-[14px] border px-3 py-2`}
          style={{
            background: "rgba(242,95,92,.12)",
            borderColor: "rgba(242,95,92,.28)",
            color: LEGACY_COLORS.red,
          }}
        >
          {state.error}
        </div>
      ) : null}

      {loading ? (
        <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
          불러오는 중…
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState icon={PackageSearch} title="품목이 없습니다" description="검색어나 분류를 조정해 보세요." />
      ) : (
        <div
          className="overflow-hidden rounded-[14px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {filteredItems.slice(0, 200).map((item, idx) => {
            const selected = state.items.has(item.item_id);
            const qty = state.items.get(item.item_id) ?? 0;
            return (
              <div
                key={item.item_id}
                style={{
                  borderBottom: idx === Math.min(filteredItems.length, 200) - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                  borderLeft: selected ? `3px solid ${LEGACY_COLORS.blue}` : "3px solid transparent",
                  background: selected ? `${LEGACY_COLORS.blue as string}0d` : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (selected) dispatch({ type: "REMOVE_ITEM", itemId: item.item_id });
                    else dispatch({ type: "SET_QTY", itemId: item.item_id, qty: 1 });
                  }}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      background: selected ? LEGACY_COLORS.blue : "transparent",
                      borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                    }}
                  >
                    {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                      {item.item_name}
                    </div>
                    <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                      {item.erp_code ?? "-"}
                    </div>
                  </div>
                  <div className={`${TYPO.caption} shrink-0 tabular-nums`} style={{ color: LEGACY_COLORS.cyan }}>
                    {formatQty(item.quantity)} {item.unit}
                  </div>
                </button>

                {selected ? (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <MiniStepper value={qty} onChange={(n) => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: n })} />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "REMOVE_ITEM", itemId: item.item_id })}
                      className={`${TYPO.caption} ml-auto flex items-center gap-1 rounded-[10px] px-2 py-1 font-semibold`}
                      style={{ color: LEGACY_COLORS.red }}
                    >
                      <Trash2 size={12} /> 제거
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <StickyFooter>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
              선택됨
            </div>
            <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {selectedList.length}건
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={selectedList.length === 0}
            className={`${TYPO.body} flex-1 rounded-[14px] py-3 font-black disabled:opacity-40`}
            style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
          >
            다음
          </button>
        </div>
      </StickyFooter>

      {scanOpen ? (
        <BarcodeScannerModal
          onDetected={handleScanned}
          onClose={() => setScanOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MiniStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (delta: number) => onChange(Math.max(1, value + delta));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.red as string}22`, color: LEGACY_COLORS.red }}
      >
        -10
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Minus size={14} />
      </button>
      <div
        className={`${TYPO.body} min-w-[54px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => step(10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.green as string}22`, color: LEGACY_COLORS.green }}
      >
        +10
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — 확인 · 메모                                                         */
/* -------------------------------------------------------------------------- */

export function StepConfirm({
  items,
  employee,
  onSubmit,
  onBack,
}: {
  items: Item[];
  employee: Employee | null;
  onSubmit: () => void;
  onBack?: () => void;
}) {
  const { state, dispatch } = useWarehouseWizard();
  const meta = state.mode ? WAREHOUSE_MODE_META[state.mode as WarehouseMode] : null;

  const selectedList = Array.from(state.items.entries())
    .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id), qty }))
    .filter((e): e is { item: Item; qty: number } => !!e.item);

  const totalQty = selectedList.reduce((sum, e) => sum + e.qty, 0);

  const headline = meta ? `${meta.label}을 처리합니다` : "처리 내용을 확정합니다";

  return (
    <div className="flex flex-col gap-3 px-4 pb-36 pt-4">
      <div>
        <div
          className={`${TYPO.headline} font-black leading-tight`}
          style={{ color: LEGACY_COLORS.green }}
        >
          {headline}
        </div>
        <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted2 }}>
          확정을 누르면 지금 즉시 재고가 반영됩니다.
        </div>
      </div>

      <SectionCard title="기본 정보" padding="sm">
        <SectionCardRow label="유형" value={meta?.label ?? "-"} />
        <SectionCardRow
          label="흐름"
          value={meta ? `${meta.flow.from} → ${meta.flow.to}` : "-"}
          valueColor={LEGACY_COLORS.blue}
        />
        <SectionCardRow
          label="담당"
          value={employee ? `${employee.name} · ${normalizeDepartment(employee.department)}` : "-"}
        />
      </SectionCard>

      <SectionCard
        title={`품목 · ${selectedList.length}건 · 합계 ${formatQty(totalQty)}`}
        padding="none"
      >
        <div className="max-h-[30vh] overflow-y-auto">
          {selectedList.map((e, idx) => (
            <div
              key={e.item.item_id}
              className="flex items-center justify-between px-4 py-2"
              style={{
                borderBottom:
                  idx === selectedList.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {e.item.item_name}
                </div>
                <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                  {e.item.erp_code}
                </div>
              </div>
              <div className={`${TYPO.title} shrink-0 font-black tabular-nums`} style={{ color: LEGACY_COLORS.blue }}>
                {formatQty(e.qty)} {e.item.unit}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="참조번호 · 비고" padding="sm">
        <div className="flex flex-col gap-2">
          <input
            value={state.referenceNo}
            onChange={(e) => dispatch({ type: "SET_REFERENCE", referenceNo: e.target.value })}
            placeholder="참조번호 (예: LOT-240412)"
            className={`${TYPO.body} rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <textarea
            value={state.note}
            onChange={(e) => dispatch({ type: "SET_NOTE", note: e.target.value })}
            rows={2}
            placeholder="비고 (선택)"
            className={`${TYPO.body} resize-none rounded-[14px] border px-3 py-3 outline-none`}
            style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </div>
      </SectionCard>

      {state.error ? (
        <div
          className={`${TYPO.caption} rounded-[14px] border px-3 py-2`}
          style={{
            background: "rgba(242,95,92,.12)",
            borderColor: "rgba(242,95,92,.28)",
            color: LEGACY_COLORS.red,
          }}
        >
          {state.error}
        </div>
      ) : null}

      <StickyFooter>
        <div className="flex flex-col gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={state.submitting}
              className={`${TYPO.caption} w-full rounded-[14px] py-2 font-semibold disabled:opacity-40`}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              뒤로 가서 수정
            </button>
          ) : null}
          <PrimaryActionButton
            intent="success"
            label={meta ? `${meta.label} 확정` : "확정"}
            count={selectedList.length}
            total={totalQty}
            onClick={onSubmit}
            disabled={state.submitting}
            loadingText="처리 중…"
          />
        </div>
      </StickyFooter>
    </div>
  );
}

function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      {hint ? (
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
