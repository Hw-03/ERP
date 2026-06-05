"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { Tooltip } from "@/lib/ui";
import { EmptyState } from "../common";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { DEPT_OPTIONS, PAGE_SIZE, matchesSearch } from "../_warehouse_steps/_constants";
import { DEPT_LETTER_TO_NAME, deptOf } from "../_admin_sections/_bom_workbench/bomDept";
import { LabeledSelect } from "../_warehouse_v2/_atoms";
import type { Item, ProductModel } from "../_warehouse_v2/types";
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
} from "../_warehouse_v2/itemPickerShared";

const INITIAL_DISPLAY_LIMIT = PAGE_SIZE * 2;

interface Props {
  items: Item[];
  productModels: ProductModel[];
  /** 정렬 우선순위 기준 대상 부서. */
  targetDepartment?: string | null;
  /** 이미 장바구니에 담긴 item_id 집합 — "담김" 표시·중복 추가 방지. */
  selectedIds: Set<string>;
  onAdd: (item: Item) => void;
}

/**
 * 불량 탭 전용 평면 다중선택 품목 선택기.
 * IoTargetPicker 의 필터(부서/모델/단계/검색) + 재고표(창고/부서) + 정렬을
 * itemPickerShared 로 재사용하되, BOM/낱개 분기 없이 행마다 "추가" 1버튼.
 */
export function DefectItemPicker({
  items,
  productModels,
  targetDepartment,
  selectedIds,
  onAdd,
}: Props) {
  const [dept, setDept] = useState("ALL");
  const [model, setModel] = useState("전체");
  const [stage, setStage] = useState("ALL");
  const [search, setSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY_LIMIT);
  const operator = useCurrentOperator();

  const keyword = search.trim().toLowerCase();

  const deptPriorityByLetter = useMemo(
    () => buildDeptPriorityByLetter(targetDepartment),
    [targetDepartment],
  );
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

  const hasActiveFilter = dept !== "ALL" || model !== "전체" || stage !== "ALL" || keyword.length > 0;

  function clearFilters() {
    setDept("ALL");
    setModel("전체");
    setStage("ALL");
    setSearch("");
  }

  const modelOptions = ["전체", "공용", ...productModels.map((m) => m.model_name ?? "")].map((v) => ({
    value: v,
    label: v,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 필터 */}
      <div className="grid shrink-0 grid-cols-[1fr_1fr_1fr_2fr] gap-2">
        <LabeledSelect label="부서" value={dept} onChange={setDept} options={DEPT_OPTIONS} />
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품목명 · 품목 코드"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>
        </label>
      </div>

      {/* 결과 표 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-[16px] border"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          overscrollBehavior: "contain",
        }}
      >
        <table className="w-full border-collapse text-sm">
          <colgroup>
            <col style={{ width: "58%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr
              className="text-left text-[11px] font-bold uppercase tracking-[1.5px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {["품목명", "품목 코드", "창고", "부서", "추가"].map((h, i) => (
                <th
                  key={h}
                  className={
                    i === 0
                      ? "px-3 py-2"
                      : i === 4
                        ? "px-3 py-2 text-center"
                        : "hidden whitespace-nowrap px-3 py-2 text-center sm:table-cell"
                  }
                  style={{
                    background: "var(--c-popup-bg)",
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.slice(0, displayLimit).map((item) => {
              const prodByDept = getProdByDept(item);
              const letter = deptOf(item.process_type_code);
              const impliedDeptName = letter ? DEPT_LETTER_TO_NAME[letter] : null;
              const impliedQty = impliedDeptName ? (prodByDept.get(impliedDeptName) ?? 0) : 0;
              const hasOthers = Array.from(prodByDept.keys()).some((d) => d !== impliedDeptName);
              const noDeptStock = prodByDept.size === 0;
              const wQty = Number(item.warehouse_qty) || 0;
              const added = selectedIds.has(item.item_id);
              return (
                <tr key={item.item_id} className="transition-colors hover:brightness-110">
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
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => onAdd(item)}
                      className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[12px] font-black text-white transition-colors disabled:cursor-default"
                      style={{
                        background: added ? LEGACY_COLORS.s2 : LEGACY_COLORS.red,
                        color: added ? LEGACY_COLORS.muted2 : LEGACY_COLORS.white,
                        borderColor: added ? LEGACY_COLORS.border : LEGACY_COLORS.red,
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      {added ? (
                        <>
                          <Check className="h-3 w-3" />
                          담김
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          추가
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
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

        {filteredItems.length > displayLimit && (
          <div className="p-2">
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-[12px] border py-2.5 text-sm font-semibold transition-colors hover:brightness-110"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted2,
              }}
            >
              100개 더 보기 ({formatQty(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} / {formatQty(filteredItems.length)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
