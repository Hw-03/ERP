"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  PackageSearch,
  Package as PackageIcon,
  ScanLine,
  Trash2,
} from "lucide-react";
import type { Department, Employee, Item, ShipPackage } from "@/lib/api";
import { BarcodeScannerModal } from "../../../BarcodeScannerModal";
import {
  LEGACY_COLORS,
  employeeColor,
  formatNumber,
} from "../../../legacyUi";
import type { ToastState } from "../../../Toast";
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
import { DEPT_WIZARD_DEPARTMENTS } from "./deptWizardConfig";
import { useDeptWizard } from "./context";

/* -------------------------------------------------------------------------- */
/* Step 1 — 부서                                                               */
/* -------------------------------------------------------------------------- */

export function StepDepartment() {
  const { state, dispatch } = useDeptWizard();
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title="어느 부서의 거래인지 선택합니다"
        hint="선택 시 바로 해당 부서의 담당자 단계로 넘어갑니다"
      />
      <div className="grid grid-cols-2 gap-2">
        {DEPT_WIZARD_DEPARTMENTS.map((dept) => {
          const active = state.department === dept;
          const color = employeeColor(dept);
          return (
            <button
              key={dept}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DEPARTMENT", department: dept });
                dispatch({ type: "NEXT" });
              }}
              className="flex flex-col items-start gap-1 rounded-[20px] border px-4 py-4 text-left active:scale-[0.98]"
              style={{
                background: active ? `${color}1a` : LEGACY_COLORS.s2,
                borderColor: active ? color : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[14px]"
                style={{ background: `${color}22`, color }}
              >
                <span className={`${TYPO.body} font-black`}>{dept.slice(0, 1)}</span>
              </div>
              <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {dept}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {dept === "출하" ? "출하 · 패키지" : `${dept}부`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — 담당자                                                              */
/* -------------------------------------------------------------------------- */

export function StepPerson({
  employees,
  loading,
}: {
  employees: Employee[];
  loading: boolean;
}) {
  const { state, dispatch } = useDeptWizard();

  const visibleEmployees = useMemo(
    () => employees.filter((e) => e.department === (state.department as Department)),
    [employees, state.department],
  );

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title={`${state.department ?? ""}부 담당자를 선택합니다`}
        hint="담당자 선택 시 다음 단계로 자동 이동합니다"
      />
      {visibleEmployees.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="등록된 담당자가 없습니다"
          description="관리자 탭에서 직원을 추가해 주세요."
        />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {visibleEmployees.map((e) => (
            <PersonAvatar
              key={e.employee_id}
              name={e.name}
              department={e.department}
              selected={state.employeeId === e.employee_id}
              onClick={() => {
                dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                dispatch({ type: "NEXT" });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — 방향                                                                */
/* -------------------------------------------------------------------------- */

export function StepDirection() {
  const { state, dispatch } = useDeptWizard();
  const options = [
    {
      key: "in" as const,
      label: "부서 입고",
      description: "창고 재고를 부서로 받아들입니다",
      icon: ArrowDownToLine,
      color: LEGACY_COLORS.green,
    },
    {
      key: "out" as const,
      label: "부서 출고",
      description: "부서에서 창고로 내보내거나 출하합니다",
      icon: ArrowUpFromLine,
      color: LEGACY_COLORS.red,
    },
  ];
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title="입고인지 출고인지 선택합니다"
        hint="부서가 받는지(입고) 내보내는지(출고)에 따라 재고가 반대로 움직입니다"
      />
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const active = state.direction === o.key;
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DIRECTION", direction: o.key });
                dispatch({ type: "NEXT" });
              }}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: active ? `${o.color}1a` : LEGACY_COLORS.s2,
                borderColor: active ? o.color : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${o.color}22`, color: o.color }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {o.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {o.description}
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
/* Step 4 — 품목/수량 (개별 다중 / 패키지 단일)                                     */
/* -------------------------------------------------------------------------- */

const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "RM", label: "원자재" },
  { id: "A", label: "조립품" },
  { id: "F", label: "반제품" },
  { id: "FG", label: "완제품" },
] as const;

export function StepItems({
  items,
  itemsLoading,
  packages,
  packagesLoading,
  onNext,
  showToast,
}: {
  items: Item[];
  itemsLoading: boolean;
  packages: ShipPackage[];
  packagesLoading: boolean;
  onNext: () => void;
  showToast?: (toast: ToastState) => void;
}) {
  const { state, dispatch } = useDeptWizard();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof ITEM_CATEGORIES)[number]["id"]>("ALL");
  const [scanOpen, setScanOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const canUsePackage = state.direction === "out";

  const filtered = useMemo(() => {
    const k = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (category === "RM" && item.category !== "RM") return false;
      if (category === "A" && !["TA", "HA", "VA", "BA"].includes(item.category)) return false;
      if (category === "F" && !["TF", "HF", "VF", "AF"].includes(item.category)) return false;
      if (category === "FG" && item.category !== "FG") return false;
      if (!k) return true;
      const hay = `${item.item_name} ${item.erp_code ?? ""} ${item.barcode ?? ""}`.toLowerCase();
      return hay.includes(k);
    });
  }, [items, category, deferredSearch]);

  const selectedCount = state.usePackage ? (state.packageId ? 1 : 0) : state.items.size;

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
      <StepHeading
        title={
          state.usePackage
            ? "출하할 패키지를 선택합니다"
            : "처리할 품목과 수량을 결정합니다"
        }
        hint={canUsePackage ? "개별 품목과 출하 패키지 중 하나로 처리할 수 있습니다" : undefined}
      />

      {canUsePackage ? (
        <FilterChipRow>
          <FilterChip
            label="개별 품목"
            active={!state.usePackage}
            onClick={() => dispatch({ type: "SET_USE_PACKAGE", value: false })}
          />
          <FilterChip
            label="출하 패키지"
            active={state.usePackage}
            onClick={() => dispatch({ type: "SET_USE_PACKAGE", value: true })}
            color={LEGACY_COLORS.purple}
          />
        </FilterChipRow>
      ) : null}

      {state.usePackage ? (
        <PackagePicker packages={packages} loading={packagesLoading} />
      ) : (
        <>
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

          <ItemPicker items={filtered} loading={itemsLoading} />
        </>
      )}

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
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
              {state.usePackage ? "패키지" : "선택됨"}
            </div>
            <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
              {selectedCount}건
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={selectedCount === 0}
            className={`${TYPO.body} flex-1 rounded-[14px] py-3 font-black disabled:opacity-40`}
            style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
          >
            다음
          </button>
        </div>
      </StickyFooter>

      {scanOpen ? (
        <BarcodeScannerModal onDetected={handleScanned} onClose={() => setScanOpen(false)} />
      ) : null}
    </div>
  );
}

function PackagePicker({ packages, loading }: { packages: ShipPackage[]; loading: boolean }) {
  const { state, dispatch } = useDeptWizard();
  if (loading) {
    return (
      <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        패키지를 불러오는 중…
      </div>
    );
  }
  if (packages.length === 0) {
    return <EmptyState icon={PackageIcon} title="등록된 출하 패키지가 없습니다" />;
  }
  const qty = state.items.get("__PACKAGE__") ?? 1;
  return (
    <div className="flex flex-col gap-2">
      {packages.map((pkg) => {
        const selected = state.packageId === pkg.package_id;
        return (
          <button
            key={pkg.package_id}
            type="button"
            onClick={() => {
              dispatch({ type: "SET_PACKAGE", packageId: pkg.package_id });
              dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: 1 });
            }}
            className="flex flex-col gap-1 rounded-[20px] border px-4 py-3 text-left active:scale-[0.99]"
            style={{
              background: selected ? `${LEGACY_COLORS.purple as string}14` : LEGACY_COLORS.s2,
              borderColor: selected ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {pkg.name}
              </div>
              <div className={`${TYPO.caption} font-mono`} style={{ color: LEGACY_COLORS.muted2 }}>
                {pkg.package_code}
              </div>
            </div>
            <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              {pkg.items.length}개 구성
            </div>
          </button>
        );
      })}

      {state.packageId ? (
        <div
          className="flex items-center justify-between rounded-[14px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
            출하 수량
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: Math.max(1, qty - 1) })}
              className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
            >
              −
            </button>
            <div
              className={`${TYPO.title} min-w-[48px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.blue }}
            >
              {qty}
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: qty + 1 })}
              className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
            >
              ＋
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ItemPicker({ items, loading }: { items: Item[]; loading: boolean }) {
  const { state, dispatch } = useDeptWizard();
  if (loading) {
    return (
      <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        불러오는 중…
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={PackageSearch} title="품목이 없습니다" description="검색어나 분류를 조정해 보세요." />;
  }
  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {items.slice(0, 200).map((item, idx) => {
        const selected = state.items.has(item.item_id);
        const qty = state.items.get(item.item_id) ?? 0;
        return (
          <div
            key={item.item_id}
            style={{
              borderBottom:
                idx === Math.min(items.length, 200) - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
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
                <div className={`${TYPO.caption} truncate font-mono`} style={{ color: LEGACY_COLORS.muted }}>
                  {item.erp_code ?? "-"}
                </div>
              </div>
              <div
                className={`${TYPO.caption} shrink-0 font-mono tabular-nums`}
                style={{ color: LEGACY_COLORS.cyan }}
              >
                {formatNumber(item.quantity)} {item.unit}
              </div>
            </button>
            {selected ? (
              <div className="flex items-center gap-2 px-3 pb-3">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: Math.max(1, qty - 10) })}
                  className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
                  style={{ background: `${LEGACY_COLORS.red as string}22`, color: LEGACY_COLORS.red }}
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: Math.max(1, qty - 1) })}
                  className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
                  style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                >
                  −
                </button>
                <div
                  className={`${TYPO.body} min-w-[54px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
                  style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
                >
                  {qty}
                </div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: qty + 1 })}
                  className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
                  style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                >
                  ＋
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: qty + 10 })}
                  className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
                  style={{ background: `${LEGACY_COLORS.green as string}22`, color: LEGACY_COLORS.green }}
                >
                  +10
                </button>
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
  );
}

/* -------------------------------------------------------------------------- */
/* Step 5 — 확인                                                                */
/* -------------------------------------------------------------------------- */

export function StepConfirm({
  items,
  employee,
  packages,
  onSubmit,
  onBack,
}: {
  items: Item[];
  employee: Employee | null;
  packages: ShipPackage[];
  onSubmit: () => void;
  onBack?: () => void;
}) {
  const { state, dispatch } = useDeptWizard();
  const pkg = packages.find((p) => p.package_id === state.packageId) ?? null;
  const pkgQty = state.items.get("__PACKAGE__") ?? 1;

  const selectedList = Array.from(state.items.entries())
    .filter(([id]) => id !== "__PACKAGE__")
    .map(([id, q]) => ({ item: items.find((i) => i.item_id === id), qty: q }))
    .filter((e): e is { item: Item; qty: number } => !!e.item);

  const totalQty = selectedList.reduce((s, e) => s + e.qty, 0);
  const directionLabel = state.direction === "in" ? "입고" : state.direction === "out" ? "출고" : "-";
  const intent: "success" | "danger" = state.direction === "in" ? "success" : "danger";
  const headlineColor = state.direction === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red;
  const headline = `${state.department ?? ""}부 · ${directionLabel}을 처리합니다`;

  return (
    <div className="flex flex-col gap-3 px-4 pb-36 pt-4">
      <div>
        <div
          className={`${TYPO.headline} font-black leading-tight`}
          style={{ color: headlineColor }}
        >
          {headline}
        </div>
        <div className={`${TYPO.caption} mt-1`} style={{ color: LEGACY_COLORS.muted2 }}>
          확정을 누르면 지금 즉시 재고가 반영됩니다.
        </div>
      </div>

      <SectionCard title="기본 정보" padding="sm">
        <SectionCardRow label="부서" value={state.department ?? "-"} />
        <SectionCardRow label="담당" value={employee?.name ?? "-"} />
        <SectionCardRow
          label="방향"
          value={state.direction === "in" ? "부서 입고" : state.direction === "out" ? "부서 출고" : "-"}
          valueColor={headlineColor}
        />
      </SectionCard>

      {state.usePackage ? (
        <SectionCard title="패키지" padding="sm">
          <SectionCardRow
            label="이름"
            value={pkg ? pkg.name : "-"}
          />
          <SectionCardRow
            label="출하 수량"
            value={pkg ? `${pkgQty}회` : "-"}
            valueColor={LEGACY_COLORS.purple}
          />
          {pkg ? (
            <SectionCardRow
              label="구성"
              value={`${pkg.items.length}개`}
              valueColor={LEGACY_COLORS.muted2}
            />
          ) : null}
        </SectionCard>
      ) : (
        <SectionCard
          title={`품목 · ${selectedList.length}건 · 합계 ${formatNumber(totalQty)}`}
          padding="none"
        >
          <div className="max-h-[30vh] overflow-y-auto">
            {selectedList.map((e, idx) => (
              <div
                key={e.item.item_id}
                className="flex items-center justify-between px-4 py-2"
                style={{
                  borderBottom: idx === selectedList.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                    {e.item.item_name}
                  </div>
                  <div className={`${TYPO.caption} truncate font-mono`} style={{ color: LEGACY_COLORS.muted }}>
                    {e.item.erp_code}
                  </div>
                </div>
                <div
                  className={`${TYPO.title} shrink-0 font-black tabular-nums`}
                  style={{ color: LEGACY_COLORS.blue }}
                >
                  {formatNumber(e.qty)} {e.item.unit}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="참조번호 · 비고" padding="sm">
        <div className="flex flex-col gap-2">
          <input
            value={state.referenceNo}
            onChange={(e) => dispatch({ type: "SET_REFERENCE", referenceNo: e.target.value })}
            placeholder="참조번호 (예: DIO-240412)"
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
            intent={intent}
            label={
              state.usePackage
                ? `패키지 출하 확정 · ${pkgQty}회`
                : `부서 ${directionLabel} 확정`
            }
            count={state.usePackage ? undefined : selectedList.length}
            total={state.usePackage ? undefined : totalQty}
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
