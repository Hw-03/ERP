"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { Tooltip } from "@/lib/ui";
import { EmptyState } from "../common";
import {
  DEPT_OPTIONS,
  PAGE_SIZE,
  PROD_DEPTS,
  matchesSearch,
} from "../_warehouse_steps/_constants";
import { DEPT_LETTER_TO_NAME, deptOf, stageOf, type DeptLetter } from "../_admin_sections/_bom_workbench/bomDept";
import { LabeledSelect, SettingLabel } from "./_atoms";
import type { IoBundle, IoSubType, IoWorkType, Item, ProductModel, ShipPackage } from "./types";
import {
  canPickPackages,
  deptIoSubType,
  getItemActionMode,
  type DeptIoDirection,
  type ItemActionMode,
} from "./ioWorkType";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  deptIoDirection: DeptIoDirection | null;
  bundleSubType: IoSubType | null;
  bomParents: Set<string>;
  targetDepartment?: string | null;
  items: Item[];
  packages: ShipPackage[];
  productModels: ProductModel[];
  bundles: IoBundle[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddItem: (item: Item, sourceKind?: "direct_item" | "manual", subTypeOverride?: IoSubType) => void;
  onAddPackage: (pkg: ShipPackage) => void;
  onAdvance: () => void;
  busy?: boolean;
}

const STAGE_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RAW", label: "원자재" },
  { value: "MID", label: "중간공정" },
  { value: "DONE", label: "공정완료" },
];

const NAME_TO_LETTER: Record<string, DeptLetter> = {
  튜브: "T",
  고압: "H",
  진공: "V",
  튜닝: "N",
  조립: "A",
  출하: "P",
};

function matchesDept(item: Item, dept: string) {
  if (dept === "ALL") return true;
  if (dept === "창고") return Number(item.warehouse_qty || 0) > 0;
  const letter = NAME_TO_LETTER[dept];
  if (!letter) return true;
  return deptOf(item.process_type_code) === letter;
}

function matchesStage(item: Item, stage: string) {
  if (stage === "ALL") return true;
  const s = stageOf(item.process_type_code);
  if (!s) return false;
  if (stage === "RAW") return s === "R";
  if (stage === "MID") return s === "A";
  if (stage === "DONE") return s === "F";
  return true;
}

function matchesModel(item: Item, model: string) {
  if (model === "전체") return true;
  if (model === "공용") return !item.legacy_model || item.legacy_model.trim() === "";
  return item.legacy_model === model;
}

// PRODUCTION 위치만 부서별로 합산. 0 이하는 제외해 tooltip noise 방지.
function getProdByDept(item: Item): Map<string, number> {
  const m = new Map<string, number>();
  for (const loc of item.locations) {
    if (loc.status !== "PRODUCTION") continue;
    const q = Number(loc.quantity) || 0;
    if (q <= 0) continue;
    m.set(loc.department, (m.get(loc.department) ?? 0) + q);
  }
  return m;
}

// PROD_DEPTS (튜브→고압→진공→튜닝→조립→출하) 순서 고정. 그 외(AS/기타) 는 그대로 뒤에 알파벳 순.
const DEPT_ORDER_INDEX = new Map<string, number>(PROD_DEPTS.map((d, i) => [d, i]));
function renderDeptBreakdown(prodByDept: Map<string, number>) {
  const entries = Array.from(prodByDept.entries()).sort(([a], [b]) => {
    const ai = DEPT_ORDER_INDEX.get(a) ?? 100;
    const bi = DEPT_ORDER_INDEX.get(b) ?? 100;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([dept, qty]) => (
        <div key={dept} className="flex justify-between gap-3 tabular-nums">
          <span>{dept}</span>
          <span>{formatQty(qty)}</span>
        </div>
      ))}
    </div>
  );
}

export function IoTargetPicker({
  workType,
  subType,
  deptIoDirection,
  bundleSubType,
  bomParents,
  targetDepartment,
  items,
  packages,
  productModels,
  bundles,
  search,
  onSearchChange,
  onAddItem,
  onAddPackage,
  onAdvance,
  busy,
}: Props) {
  const [dept, setDept] = useState("ALL");
  const [model, setModel] = useState("전체");
  const [stage, setStage] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const showPackages = canPickPackages(workType);
  const actionMode = getItemActionMode(subType);
  const keyword = search.trim().toLowerCase();
  const deptOptions = DEPT_OPTIONS;

  // Step 2 에서 선택한 대상 부서 → PROD 부서 순서 기준 우선순위 맵.
  // 같은 부서 내에서는 서버 정렬 유지 (stable sort).
  const deptPriorityByLetter = useMemo(() => {
    const base = [...PROD_DEPTS] as string[];
    const ordered =
      targetDepartment && base.includes(targetDepartment)
        ? [targetDepartment, ...base.filter((d) => d !== targetDepartment)]
        : base;
    const map = new Map<string, number>();
    ordered.forEach((name, idx) => {
      const letter = NAME_TO_LETTER[name];
      if (letter) map.set(letter, idx);
    });
    return map;
  }, [targetDepartment]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        matchesDept(item, dept) &&
        matchesModel(item, model) &&
        matchesStage(item, stage) &&
        matchesSearch(item, keyword),
    );
    return filtered
      .map((item, idx) => {
        const letter = deptOf(item.process_type_code);
        const priority = letter ? deptPriorityByLetter.get(letter) ?? 999 : 999;
        return { item, priority, idx };
      })
      .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.idx - b.idx))
      .map((row) => row.item);
  }, [items, dept, model, stage, keyword, deptPriorityByLetter]);

  const filteredPackages = useMemo(() => {
    if (!keyword) return packages;
    return packages.filter((pkg) =>
      `${pkg.package_code} ${pkg.name}`.toLowerCase().includes(keyword),
    );
  }, [packages, keyword]);

  const parentCount = bundles.reduce(
    (acc, b) => acc + b.lines.filter((l) => l.origin === "direct" || l.origin === "manual").length,
    0,
  );
  const childCount = bundles.reduce(
    (acc, b) => acc + b.lines.filter((l) => l.origin === "bom_auto" || l.origin === "package_auto").length,
    0,
  );
  const hasActiveFilter = dept !== "ALL" || model !== "전체" || stage !== "ALL" || keyword.length > 0;

  function clearFilters() {
    setDept("ALL");
    setModel("전체");
    setStage("ALL");
    onSearchChange("");
  }

  const modelOptions = ["전체", "공용", ...productModels.map((m) => m.model_name ?? "")].map((v) => ({
    value: v,
    label: v,
  }));

  return (
    <div className="space-y-3">
      {/* 필터 */}
      {!showPackages ? (
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-2">
          <LabeledSelect label="부서" value={dept} onChange={setDept} options={deptOptions} />
          <LabeledSelect label="모델" value={model} onChange={setModel} options={modelOptions} />
          <LabeledSelect label="단계" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <label className="flex flex-col gap-0.5">
            <span
              className="text-[10px] font-bold uppercase tracking-[1.5px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              검색
            </span>
            <div
              className="flex items-center gap-1.5 rounded-[10px] border px-2 py-1.5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="품목명 · 품목 코드"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>
          </label>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="패키지명 · 코드"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
      )}

      {/* 결과 영역 */}
      <div
        className="scrollbar-hide max-h-[440px] overflow-y-auto rounded-[16px] border"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          overscrollBehavior: "contain",
        }}
      >
        {showPackages ? (
          filteredPackages.length === 0 ? (
            <div className="px-3 py-6">
              <EmptyState compact title="검색 결과 없음" description="다른 키워드를 시도하세요." />
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
              {filteredPackages.map((pkg) => (
                <li key={pkg.package_id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAddPackage(pkg)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                        {pkg.name}
                      </span>
                      <span className="block truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                        {pkg.package_code} · 구성 {pkg.items.length}개
                      </span>
                    </span>
                    <span
                      className="flex h-7 items-center gap-1 rounded-[10px] px-3 text-[11px] font-black text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      <Plus className="h-3 w-3" />
                      추가
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ItemTable
            items={filteredItems}
            displayLimit={displayLimit}
            onShowMore={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
            onAdd={onAddItem}
            busy={busy}
            hasActiveFilter={hasActiveFilter}
            clearFilters={clearFilters}
            mode={actionMode}
            workType={workType}
            deptIoDirection={deptIoDirection}
            bundleSubType={bundleSubType}
            bomParents={bomParents}
          />
        )}
      </div>

      {/* 하단 advance 버튼 — 선택 품목 없으면 비활성 */}
      <button
        type="button"
        onClick={onAdvance}
        disabled={bundles.length === 0}
        className="flex w-full items-center justify-between rounded-[12px] border px-4 py-3 text-sm font-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: bundles.length > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
          borderColor: bundles.length > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: bundles.length > 0 ? "#fff" : LEGACY_COLORS.muted2,
        }}
      >
        {bundles.length > 0 ? (
          <>
            <span>{`상위 ${parentCount}개 · 하위 ${childCount}개`}</span>
            <span className="flex items-center gap-1.5">
              수량 조정
              <ArrowRight className="h-4 w-4" />
            </span>
          </>
        ) : (
          <span className="ml-auto flex items-center gap-1.5">
            수량 조정
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </button>
    </div>
  );
}

function ItemTable({
  items,
  displayLimit,
  onShowMore,
  onAdd,
  busy,
  hasActiveFilter,
  clearFilters,
  mode,
  workType,
  deptIoDirection,
  bundleSubType,
  bomParents,
}: {
  items: Item[];
  displayLimit: number;
  onShowMore: () => void;
  onAdd: (item: Item, sourceKind?: "direct_item" | "manual", subTypeOverride?: IoSubType) => void;
  busy?: boolean;
  hasActiveFilter: boolean;
  clearFilters: () => void;
  mode: ItemActionMode;
  workType: IoWorkType;
  deptIoDirection: DeptIoDirection | null;
  bundleSubType: IoSubType | null;
  bomParents: Set<string>;
}) {
  const isProcess = workType === "process" && deptIoDirection != null;
  const bomTarget = isProcess ? deptIoSubType(deptIoDirection!, "bom") : null;
  const singleTarget = isProcess ? deptIoSubType(deptIoDirection!, "single") : null;
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr
            className="text-left text-[11px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <th
              className="px-3 py-2"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              품목명
            </th>
            <th
              className="px-3 py-2"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              품목 코드
            </th>
            <th
              className="whitespace-nowrap px-3 py-2 text-right"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              창고
            </th>
            <th
              className="whitespace-nowrap px-3 py-2 text-right"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              부서
            </th>
            <th
              className="px-3 py-2 text-center"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              추가
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, displayLimit).map((item) => {
            const prodByDept = getProdByDept(item);
            const letter = deptOf(item.process_type_code);
            const impliedDeptName = letter ? DEPT_LETTER_TO_NAME[letter] : null;
            const impliedQty = impliedDeptName ? (prodByDept.get(impliedDeptName) ?? 0) : 0;
            const hasOthers = Array.from(prodByDept.keys()).some((d) => d !== impliedDeptName);
            const noDeptStock = prodByDept.size === 0;
            const wQty = Number(item.warehouse_qty) || 0;
            return (
              <tr
                key={item.item_id}
                className="transition-colors hover:brightness-110"
              >
                <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {item.item_name}
                  </span>
                </td>
                <td
                  className="px-3 py-2"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.erp_code ?? "-"}
                  </span>
                </td>
                <td
                  className="px-3 py-2 text-right text-base font-black tabular-nums"
                  style={{
                    color: wQty > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {formatQty(wQty)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  {noDeptStock ? (
                    <span className="text-base font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                      -
                    </span>
                  ) : (
                    <Tooltip content={renderDeptBreakdown(prodByDept)} multiline>
                      <span
                        className="text-base font-black tabular-nums"
                        style={{ color: impliedQty > 0 || hasOthers ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}
                      >
                        {formatQty(impliedQty)}
                        {hasOthers && (
                          <span className="ml-0.5" style={{ color: LEGACY_COLORS.muted2 }}>
                            +
                          </span>
                        )}
                      </span>
                    </Tooltip>
                  )}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2 text-center"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <span className="inline-flex gap-1">
                    {isProcess ? (() => {
                      const hasBom = bomParents.has(item.item_id);
                      const bomLockedByMode = bundleSubType != null && bundleSubType !== bomTarget;
                      const singleLockedByMode = bundleSubType != null && bundleSubType !== singleTarget;
                      const bomDisabled = busy || bomLockedByMode || !hasBom;
                      const singleDisabled = busy || singleLockedByMode;
                      const bomTitle = !hasBom
                        ? "등록된 BOM이 없습니다"
                        : bomLockedByMode
                          ? "낱개와 BOM은 같이 작업할 수 없습니다. 묶음을 비우고 다시 선택하세요."
                          : "BOM 적용 — 하위 자재까지 같이 처리";
                      const singleTitle = singleLockedByMode
                        ? "낱개와 BOM은 같이 작업할 수 없습니다. 묶음을 비우고 다시 선택하세요."
                        : "낱개 — 선택 품목만 처리";
                      return (
                        <>
                          <Tooltip content={bomTitle}>
                            <button
                              type="button"
                              disabled={bomDisabled}
                              onClick={() => onAdd(item, "direct_item", bomTarget!)}
                              className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[12px] font-black text-white disabled:opacity-50"
                              style={{
                                background: bomDisabled ? LEGACY_COLORS.s2 : LEGACY_COLORS.blue,
                                color: bomDisabled ? LEGACY_COLORS.muted2 : "#fff",
                                borderColor: bomDisabled ? LEGACY_COLORS.border : LEGACY_COLORS.blue,
                                borderWidth: 1,
                                borderStyle: "solid",
                              }}
                            >
                              BOM
                            </button>
                          </Tooltip>
                          <Tooltip content={singleTitle}>
                            <button
                              type="button"
                              disabled={singleDisabled}
                              onClick={() => onAdd(item, "manual", singleTarget!)}
                              className="rounded-[10px] border px-2.5 py-1 text-[12px] font-black disabled:opacity-50"
                              style={{
                                background: LEGACY_COLORS.s2,
                                borderColor: LEGACY_COLORS.border,
                                color: singleDisabled ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text,
                              }}
                            >
                              낱개
                            </button>
                          </Tooltip>
                        </>
                      );
                    })() : mode === "bom_or_single" ? (() => {
                      const hasBom = bomParents.has(item.item_id);
                      const bomDisabled = busy || !hasBom;
                      const bomTitle = hasBom
                        ? "BOM 적용 — 하위 자재까지 같이 처리"
                        : "등록된 BOM이 없습니다";
                      return (
                        <>
                          <Tooltip content={bomTitle}>
                            <button
                              type="button"
                              disabled={bomDisabled}
                              onClick={() => onAdd(item)}
                              className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[12px] font-black disabled:opacity-50"
                              style={{
                                background: bomDisabled ? LEGACY_COLORS.s2 : LEGACY_COLORS.blue,
                                color: bomDisabled ? LEGACY_COLORS.muted2 : "#fff",
                                borderColor: bomDisabled ? LEGACY_COLORS.border : LEGACY_COLORS.blue,
                                borderWidth: 1,
                                borderStyle: "solid",
                              }}
                            >
                              BOM
                            </button>
                          </Tooltip>
                          <Tooltip content="낱개 — 선택 품목만 처리">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onAdd(item, "manual")}
                              className="rounded-[10px] border px-2.5 py-1 text-[12px] font-black disabled:opacity-50"
                              style={{
                                background: LEGACY_COLORS.s2,
                                borderColor: LEGACY_COLORS.border,
                                color: LEGACY_COLORS.muted2,
                              }}
                            >
                              낱개
                            </button>
                          </Tooltip>
                        </>
                      );
                    })() : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdd(item, "manual")}
                        className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[12px] font-black text-white disabled:opacity-50"
                        style={{ background: LEGACY_COLORS.blue }}
                        title="선택 — 선택 품목만 처리"
                      >
                        <Plus className="h-3 w-3" />
                        선택
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6">
                <EmptyState
                  variant={hasActiveFilter ? "filtered-out" : "no-data"}
                  compact
                  title={hasActiveFilter ? "필터에 맞는 품목 없음" : "조회할 품목 없음"}
                  description={
                    hasActiveFilter ? "필터를 해제하면 다시 표시됩니다." : "다른 키워드를 시도하세요."
                  }
                  action={hasActiveFilter ? { label: "필터 해제", onClick: clearFilters } : undefined}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {items.length > displayLimit && (
        <div className="p-2">
          <button
            type="button"
            onClick={onShowMore}
            className="w-full rounded-[12px] border py-2.5 text-sm font-semibold transition-colors hover:brightness-110"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }}
          >
            100개 더 보기 ({formatQty(Math.min(displayLimit + PAGE_SIZE, items.length))} / {formatQty(items.length)})
          </button>
        </div>
      )}
    </>
  );
}
