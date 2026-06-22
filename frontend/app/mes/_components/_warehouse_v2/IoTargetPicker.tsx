"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, GripVertical, Plus, RotateCcw, Save, Search, Settings2 } from "lucide-react";
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
  buildEmployeeOrderRank,
  getProdByDept,
  keepCodeOnOneLine,
  matchesDept,
  matchesModel,
  matchesStage,
  renderDeptBreakdown,
  sortItemsForPicker,
} from "./itemPickerShared";
import {
  useMyItemOrderQuery,
  usePutMyItemOrderMutation,
  useResetMyItemOrderMutation,
} from "@/lib/queries/useMyItemOrderQuery";
import { useItemOrderDrag, type UseItemOrderDragResult } from "./useItemOrderDrag";
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
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<Item[]>([]);
  const operator = useCurrentOperator();

  const { data: myOrderData } = useMyItemOrderQuery(operator?.employee_id);
  const putMyOrder = usePutMyItemOrderMutation();
  const resetMyOrder = useResetMyItemOrderMutation();

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

  // 직원 개인 순서 맵 — 내 순서 없거나 초기화 후엔 빈 Map → 기존 부서순 그대로.
  const employeeOrderRank = useMemo(
    () => buildEmployeeOrderRank(myOrderData),
    [myOrderData],
  );

  const filteredItems = useMemo(() => {
    const selectedModelSlot =
      model === "전체" ? undefined :
      model === "공용" ? null :
      (productModels.find((m) => m.model_name === model)?.slot ?? undefined);
    const filtered = items.filter(
      (item) =>
        // 김건호 피드백 1 — 삭제(소프트삭제) 품목은 입출고 품목 선택에 노출하지 않음.
        !item.deleted_at &&
        matchesDept(item, dept) &&
        matchesModel(item, selectedModelSlot) &&
        matchesStage(item, stage) &&
        matchesSearch(item, keyword),
    );
    return sortItemsForPicker(filtered, deptPriorityByLetter, assignedPriorityBySlot, employeeOrderRank);
  }, [items, dept, model, stage, keyword, productModels, deptPriorityByLetter, assignedPriorityBySlot, employeeOrderRank]);

  // 빠른작업으로 진입한 강조 품목을 검색창에 미리 넣어 "검색된 상태"로 보여준다.
  // 정렬상 뒤쪽 품목으로 스크롤하려면 그 위 수백~900행을 먼저 그려야 해 1~2초+ 멈춤이 생기는데,
  // 검색으로 좁히면 짧은 목록만 렌더돼 즉시 뜨고, 그 품목이 맨 위에 보이며 깜빡인다. 1회만 적용.
  const searchPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightItemId || searchPrefillRef.current === highlightItemId) return;
    const it = items.find((x) => x.item_id === highlightItemId);
    if (!it) return; // items 아직 로딩 전 → items 갱신 시 재시도
    searchPrefillRef.current = highlightItemId;
    onSearchChange(it.item_name);
  }, [highlightItemId, items, onSearchChange]);

  // 편집 모드 진입 시 전체 items를 현재 저장순으로 초기화.
  // filteredItems가 아닌 items 전체를 편집 대상으로 사용(전체 목록 reorder).
  const allItemsSorted = useMemo(() => {
    return sortItemsForPicker(items, deptPriorityByLetter, assignedPriorityBySlot, employeeOrderRank);
  }, [items, employeeOrderRank, deptPriorityByLetter, assignedPriorityBySlot]);

  const { dragId, dropTargetId, makeHandlers } = useItemOrderDrag(editItems, setEditItems);

  function enterEditMode() {
    setEditItems(allItemsSorted);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditItems([]);
  }

  async function handleSaveOrder() {
    if (!operator?.employee_id) return;
    await putMyOrder.mutateAsync({
      employee_id: operator.employee_id,
      items: editItems.map((item, idx) => ({ item_id: item.item_id, display_order: idx })),
    });
    setEditMode(false);
    setEditItems([]);
  }

  async function handleResetOrder() {
    if (!operator?.employee_id) return;
    await resetMyOrder.mutateAsync(operator.employee_id);
    setEditMode(false);
    setEditItems([]);
  }

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
      {/* 필터 + 순서 편집 토글 */}
      <div className="flex shrink-0 flex-col gap-2">
        {/* 항목 9 — 모바일은 필터 그리드를 전폭 한 줄로(순서 편집 버튼은 아래 행). 데스크톱(lg)은 기존 인라인. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-3 gap-2 lg:flex-1 lg:grid-cols-[1fr_1fr_1fr_2fr]" style={{ opacity: editMode ? 0.4 : 1, pointerEvents: editMode ? "none" : undefined }}>
            <LabeledSelect label="부서" value={dept} onChange={setDept} options={deptOptions} />
            <LabeledSelect label="모델" value={model} onChange={setModel} options={modelOptions} />
            <LabeledSelect label="단계" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
            {/* 모바일: 검색을 아래 전체폭 줄로(드롭다운 폭 확보). 데스크톱(lg): 기존 4열 인라인. */}
            <label className="col-span-3 flex flex-col gap-0.5 lg:col-span-1">
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
          {operator?.employee_id && (
            <div className="shrink-0 self-end pb-0.5">
              {editMode ? (
                <button
                  type="button"
                  onClick={cancelEditMode}
                  className="rounded-[10px] border px-2.5 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  취소
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enterEditMode}
                  className="flex items-center gap-1 rounded-[10px] border px-2.5 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  순서 편집
                </button>
              )}
            </div>
          )}
        </div>
        {editMode && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              드래그로 순서를 변경한 뒤 저장하세요. 편집 중에는 필터가 적용되지 않습니다.
            </span>
            <button
              type="button"
              onClick={() => void handleResetOrder()}
              disabled={resetMyOrder.isPending}
              className="flex items-center gap-1 rounded-[10px] border px-2.5 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110 disabled:opacity-50"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted2,
              }}
            >
              <RotateCcw className="h-3 w-3" />
              기본 순서로 초기화
            </button>
            <button
              type="button"
              onClick={() => void handleSaveOrder()}
              disabled={putMyOrder.isPending}
              className="flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[12px] font-black text-white transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue }}
            >
              <Save className="h-3 w-3" />
              저장
            </button>
          </div>
        )}
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
        {editMode ? (
          <EditOrderTable
            items={editItems}
            dragId={dragId}
            dropTargetId={dropTargetId}
            makeHandlers={makeHandlers}
          />
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
            hasBomBundle={bundles.some((b) => b.source_kind === "bom_parent")}
            hasSingleBundle={bundles.some((b) => b.source_kind === "direct_item")}
            allowMix={allowsMixedBundles(subType)}
            highlightItemId={highlightItemId ?? null}
          />
        )}
      </div>

      {/* 하단 advance 버튼 — 선택 품목 없으면 비활성.
          항목 10 — 모바일은 sticky 로 하단 네비 위에 항상 고정(이중 스크롤에 묻히지 않게),
          데스크톱(lg)은 기존 정적 배치 그대로. */}
      <div className="sticky bottom-0 z-20 -mx-3 shrink-0 border-t border-[var(--c-border)] bg-[var(--c-s1)] px-4 pb-3 pt-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
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
        {/* 모바일(<sm): 숨긴 3열(품목코드/창고/부서)을 0폭으로 접고 품목명열이 남는 폭 흡수 → 액션이 행 우측 끝.
            데스크톱(sm:≥640): 원래 5열 비율 복원(회귀 0). */}
        <colgroup>
          <col className="w-full sm:w-[58%]" />
          <col className="w-0 sm:w-[14%]" />
          <col className="w-0 sm:w-[7%]" />
          <col className="w-0 sm:w-[8%]" />
          <col className="w-auto sm:w-[13%]" />
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
                <td className="max-w-0 w-full px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  {/* 모바일(<sm): 사양·괄호·구형/신형까지 보이도록 2줄. 데스크톱(sm:≥640): 기존 한 줄 truncate 보존. */}
                  <div
                    className="line-clamp-2 text-base font-bold leading-tight sm:line-clamp-none sm:truncate sm:leading-normal"
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    {item.item_name}
                  </div>
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

/**
 * 편집 모드 전용 테이블 — 전체 품목을 드래그 핸들과 함께 표시.
 * 선택 버튼·필터 없음. 순수 순서 변경용.
 */
function EditOrderTable({
  items,
  dragId,
  dropTargetId,
  makeHandlers,
}: {
  items: Item[];
  dragId: string | null;
  dropTargetId: string | null;
  makeHandlers: UseItemOrderDragResult["makeHandlers"];
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <colgroup>
        <col style={{ width: "4%" }} />
        <col style={{ width: "66%" }} />
        <col style={{ width: "30%" }} />
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr
          className="text-left text-[11px] font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <th
            className="px-2 py-2"
            style={{ background: "var(--c-popup-bg)", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          />
          <th
            className="px-3 py-2"
            style={{ background: "var(--c-popup-bg)", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            품목명
          </th>
          <th
            className="px-3 py-2"
            style={{ background: "var(--c-popup-bg)", borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            품목 코드
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const isDragging = dragId === item.item_id;
          const isDropTarget = dragId !== null && dropTargetId === item.item_id && dragId !== item.item_id;
          const handlers = makeHandlers(item.item_id);
          return (
            <tr
              key={item.item_id}
              data-item-id={item.item_id}
              className="transition-colors duration-150 hover:bg-[var(--c-s4)]"
              style={{
                opacity: isDragging ? 0.4 : 1,
                outline: isDropTarget ? `2px solid ${LEGACY_COLORS.blue}` : undefined,
                outlineOffset: isDropTarget ? "-1px" : undefined,
              }}
            >
              <td
                className="px-2 py-2"
                style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
              >
                <GripVertical
                  className="h-4 w-4 cursor-grab"
                  aria-label="드래그 핸들"
                  onPointerDown={handlers.onPointerDown}
                  onPointerMove={handlers.onPointerMove}
                  onPointerUp={handlers.onPointerUp}
                  style={{ ...handlers.style, color: LEGACY_COLORS.muted2 }}
                />
              </td>
              <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {item.item_name}
                </span>
              </td>
              <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {keepCodeOnOneLine(item.mes_code)}
                </span>
              </td>
            </tr>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={3} className="px-3 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              품목이 없습니다.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// 대시보드에서 BOM 부모 품목으로 진입했을 때, 해당 row 가 마운트되면 즉시
// scrollIntoView 로 가운데 정렬 + 줄 전체 점멸(.animate-row-flash)로 사용자 시선을 유도.
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
    // 검색 프리필로 목록이 짧아 그 품목은 거의 맨 위에 렌더된다 → 단순 scrollIntoView 로 충분.
    try {
      el.scrollIntoView({ block: "center" });
    } catch {
      el.scrollIntoView();
    }
    // 줄 전체 점멸 — '버튼만 강조돼 안 보인다'는 피드백 반영(globals.css .animate-row-flash, 0.5s×3회).
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isHighlight]);

  return (
    <tr
      ref={rowRef}
      className={`transition-colors duration-150 hover:bg-[var(--c-s4)]${flash ? " animate-row-flash" : ""}`}
    >
      {children}
    </tr>
  );
}
