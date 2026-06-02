"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { Tooltip } from "@/lib/ui";
import { EmptyState } from "../common";
import { useCurrentOperator } from "../login/useCurrentOperator";
import {
  DEPT_OPTIONS,
  PAGE_SIZE,
  matchesSearch,
} from "../_warehouse_steps/_constants";
import { DEPT_LETTER_TO_NAME, deptOf } from "../_admin_sections/_bom_workbench/bomDept";
import { LabeledSelect, SettingLabel } from "./_atoms";
import {
  STAGE_OPTIONS,
  buildAssignedPriorityBySlot,
  buildDeptPriorityByLetter,
  getProdByDept,
  keepCodeOnOneLine,
  matchesDept,
  matchesModel,
  matchesStage,
  renderDeptBreakdown,
} from "./itemPickerShared";
import type { IoBundle, IoSubType, IoWorkType, Item, ProductModel } from "./types";
import {
  allowsMixedBundles,
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
  productModels: ProductModel[];
  bundles: IoBundle[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddItem: (item: Item, sourceKind?: "direct_item" | "manual", subTypeOverride?: IoSubType) => void;
  onAdvance: () => void;
  busy?: boolean;
  /**
   * 대시보드에서 BOM 부모 품목으로 진입했을 때, 자동 카트 추가는 보류하고
   * 해당 row 만 시각적으로 강조한다. row 가 마운트되면 scrollIntoView 로 가운데
   * 정렬되며 2초간 배경 flash. `${item_id}__${workType}` 처럼 외부에서 키를
   * 갱신하면 다시 발동.
   */
  highlightItemId?: string | null;
}

const INITIAL_DISPLAY_LIMIT = PAGE_SIZE * 2;

export function IoTargetPicker({
  workType,
  subType,
  deptIoDirection,
  bundleSubType,
  bomParents,
  targetDepartment,
  items,
  productModels,
  bundles,
  search,
  onSearchChange,
  onAddItem,
  onAdvance,
  busy,
  highlightItemId,
}: Props) {
  const [dept, setDept] = useState("ALL");
  const [model, setModel] = useState("전체");
  const [stage, setStage] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY_LIMIT);
  const operator = useCurrentOperator();

  // 표 컨테이너 scrollTop 자체 보존 — BOM/낱개 추가 시 부모(IoComposeView) 의 wrapper height
  // 조정 → 내부 maxScrollTop 일시 축소 → 브라우저가 scrollTop 을 0 으로 clamp 하는 현상을
  // paint 후(useEffect) 시점에 사용자 마지막 위치로 되돌린다.
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  function handleTableScroll(e: React.UIEvent<HTMLDivElement>) {
    scrollPosRef.current = e.currentTarget.scrollTop;
  }

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    if (el.scrollTop !== scrollPosRef.current) {
      el.scrollTop = scrollPosRef.current;
    }
  }, [bundles]);

  const actionMode = getItemActionMode(subType);
  const keyword = search.trim().toLowerCase();
  const deptOptions = DEPT_OPTIONS;

  // Step 2 에서 선택한 대상 부서 → PROD 부서 순서 기준 우선순위 맵.
  // 같은 부서 내에서는 서버 정렬 유지 (stable sort).
  const deptPriorityByLetter = useMemo(
    () => buildDeptPriorityByLetter(targetDepartment),
    [targetDepartment],
  );

  // 조립 부서 직원의 담당 모델 slot → priority(0=상위). 배열 순서가 곧 priority.
  const assignedPriorityBySlot = useMemo(
    () => buildAssignedPriorityBySlot(operator?.assigned_model_slots),
    [operator],
  );

  const filteredItems = useMemo(() => {
    const selectedModelSlot =
      model === "전체" ? undefined :
      model === "공용" ? null :
      (productModels.find((m) => m.model_name === model)?.slot ?? undefined);
    const filtered = items.filter(
      (item) =>
        matchesDept(item, dept) &&
        matchesModel(item, selectedModelSlot) &&
        matchesStage(item, stage) &&
        matchesSearch(item, keyword),
    );
    return filtered
      .map((item, idx) => {
        const letter = deptOf(item.process_type_code);
        const priority = letter ? deptPriorityByLetter.get(letter) ?? 999 : 999;
        // 조립 그룹(letter "A") 안에서만 담당 모델 매칭 시 그룹 내 추가 우선순위 부여.
        // 한 부품이 여러 담당 모델에 공통이면 그 중 가장 높은(=값이 작은) priority 사용.
        let assemblyRank = Number.POSITIVE_INFINITY;
        if (letter === "A" && assignedPriorityBySlot.size > 0) {
          for (const slot of item.model_slots ?? []) {
            const p = assignedPriorityBySlot.get(slot);
            if (p !== undefined && p < assemblyRank) assemblyRank = p;
          }
        }
        return { item, priority, assemblyRank, idx };
      })
      .sort((a, b) =>
        a.priority !== b.priority
          ? a.priority - b.priority
          : a.assemblyRank !== b.assemblyRank
            ? a.assemblyRank - b.assemblyRank
            : a.idx - b.idx,
      )
      .map((row) => row.item);
  }, [items, dept, model, stage, keyword, productModels, deptPriorityByLetter, assignedPriorityBySlot]);

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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 필터 */}
      <div className="grid shrink-0 grid-cols-[1fr_1fr_1fr_2fr] gap-2">
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

      {/* 결과 영역 */}
      <div
        ref={tableContainerRef}
        onScroll={handleTableScroll}
        data-keep-scroll
        className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-[16px] border"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          overscrollBehavior: "contain",
        }}
      >
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
          hasBomBundle={bundles.some((b) => b.source_kind === "bom_parent")}
          hasSingleBundle={bundles.some((b) => b.source_kind === "direct_item")}
          allowMix={allowsMixedBundles(subType)}
          highlightItemId={highlightItemId ?? null}
        />
      </div>

      {/* 하단 advance 버튼 — 선택 품목 없으면 비활성 */}
      <button
        type="button"
        onClick={onAdvance}
        disabled={bundles.length === 0}
        className="flex w-full shrink-0 items-center justify-between rounded-[12px] border px-4 py-3 text-sm font-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
  hasBomBundle,
  hasSingleBundle,
  allowMix,
  highlightItemId,
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
  hasBomBundle: boolean;
  hasSingleBundle: boolean;
  allowMix: boolean;
  highlightItemId: string | null;
}) {
  const isProcess = workType === "process" && deptIoDirection != null;
  const bomTarget = isProcess ? deptIoSubType(deptIoDirection!, "bom") : null;
  const singleTarget = isProcess ? deptIoSubType(deptIoDirection!, "single") : null;
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <colgroup>
          <col style={{ width: "58%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
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
              className="hidden px-3 py-2 text-center sm:table-cell"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              품목 코드
            </th>
            <th
              className="hidden whitespace-nowrap px-3 py-2 text-center sm:table-cell"
              style={{
                background: "var(--c-popup-bg)",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              창고
            </th>
            <th
              className="hidden whitespace-nowrap px-3 py-2 text-center sm:table-cell"
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
            const isHighlight = highlightItemId === item.item_id;
            return (
              <HighlightableRow
                key={item.item_id}
                isHighlight={isHighlight}
              >
                <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {item.item_name}
                  </span>
                </td>
                <td
                  className="hidden px-3 py-2 text-center sm:table-cell"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {keepCodeOnOneLine(item.mes_code)}
                  </span>
                </td>
                <td
                  className="hidden px-3 py-2 text-center text-base font-black tabular-nums sm:table-cell"
                  style={{
                    color: wQty > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {formatQty(wQty)}
                </td>
                <td
                  className="hidden px-3 py-2 text-center sm:table-cell"
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
                      // 창고 입출고(allowMix)는 BOM·낱개 혼합 허용 — 새 결재 정책상 한 요청에서 같이 처리.
                      // 그 외(produce/disassemble)는 종전대로 한쪽만 활성 — BOM 강제와 흐름 분기가 달라 락 유지.
                      const bomLockedByMode = !allowMix && hasSingleBundle;
                      const singleLockedByMode = !allowMix && hasBomBundle;
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
                          <Tooltip content={singleTitle}>
                            <button
                              type="button"
                              disabled={singleDisabled}
                              onClick={() => onAdd(item, "manual")}
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
              </HighlightableRow>
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

// 대시보드에서 BOM 부모 품목으로 진입했을 때, 해당 row 가 마운트되면 즉시
// scrollIntoView 로 가운데 정렬 + 2초간 배경 flash 효과로 사용자 시선을 유도.
// 자동 카트 추가는 하지 않고 사용자가 직접 BOM/낱개를 선택하게 한다.
function HighlightableRow({
  isHighlight,
  children,
}: {
  isHighlight: boolean;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!isHighlight) return;
    const el = rowRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // older browsers 또는 SSR fallback
      el.scrollIntoView();
    }
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isHighlight]);

  return (
    <tr
      ref={rowRef}
      className="transition-colors hover:brightness-110"
      style={
        flash
          ? {
              background: `${LEGACY_COLORS.blue}26`, // ~15% alpha
              transition: "background-color 0.4s ease",
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
