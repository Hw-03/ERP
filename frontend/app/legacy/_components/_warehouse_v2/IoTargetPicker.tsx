"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../common";
import {
  DEPT_OPTIONS,
  PAGE_SIZE,
  matchesSearch,
} from "../_warehouse_steps/_constants";
import { deptOf, stageOf, type DeptLetter } from "../_admin_sections/_bom_workbench/bomDept";
import { LabeledSelect, SettingLabel } from "./_atoms";
import type { IoBundle, IoSubType, IoWorkType, Item, ProductModel, ShipPackage } from "./types";
import { canPickPackages, getItemActionMode, type ItemActionMode } from "./ioWorkType";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  items: Item[];
  packages: ShipPackage[];
  productModels: ProductModel[];
  bundles: IoBundle[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddItem: (item: Item, sourceKind?: "direct_item" | "manual") => void;
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

export function IoTargetPicker({
  workType,
  subType,
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

  const filteredItems = useMemo(() => {
    return items.filter(
      (item) =>
        matchesDept(item, dept) &&
        matchesModel(item, model) &&
        matchesStage(item, stage) &&
        matchesSearch(item, keyword),
    );
  }, [items, dept, model, stage, keyword]);

  const filteredPackages = useMemo(() => {
    if (!keyword) return packages;
    return packages.filter((pkg) =>
      `${pkg.package_code} ${pkg.name}`.toLowerCase().includes(keyword),
    );
  }, [packages, keyword]);

  const lineCount = bundles.reduce((acc, b) => acc + b.lines.length, 0);
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
          <LabeledSelect label="부서" value={dept} onChange={setDept} options={DEPT_OPTIONS} />
          <LabeledSelect label="모델" value={model} onChange={setModel} options={modelOptions} />
          <LabeledSelect label="단계" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <label className="flex flex-col gap-0.5">
            <span
              className="text-[9px] font-bold uppercase tracking-[1.5px]"
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
                placeholder="품목명 · 품목 코드 · 바코드"
                className="flex-1 bg-transparent text-xs outline-none"
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
        <span>
          {bundles.length > 0
            ? `선택됨: ${bundles.length}개 묶음 · 라인 ${lineCount}개`
            : "품목을 먼저 선택하세요"}
        </span>
        {bundles.length > 0 && (
          <span className="flex items-center gap-1.5">
            수량 조정하기
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
}: {
  items: Item[];
  displayLimit: number;
  onShowMore: () => void;
  onAdd: (item: Item, sourceKind?: "direct_item" | "manual") => void;
  busy?: boolean;
  hasActiveFilter: boolean;
  clearFilters: () => void;
  mode: ItemActionMode;
}) {
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr
            className="text-left text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <th
              className="px-3 py-2"
              style={{
                background: LEGACY_COLORS.s1,
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              품목명
            </th>
            <th
              className="px-3 py-2"
              style={{
                background: LEGACY_COLORS.s1,
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              품목 코드
            </th>
            <th
              className="whitespace-nowrap px-3 py-2 text-right"
              style={{
                background: LEGACY_COLORS.s1,
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              현재 재고
            </th>
            <th
              className="px-3 py-2 text-right"
              style={{
                background: LEGACY_COLORS.s1,
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              추가
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, displayLimit).map((item) => {
            return (
              <tr
                key={item.item_id}
                className="transition-colors hover:brightness-110"
              >
                <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {item.item_name}
                  </span>
                </td>
                <td
                  className="px-3 py-2"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.erp_code ?? "-"}
                  </span>
                </td>
                <td
                  className="px-3 py-2 text-right text-sm font-black tabular-nums"
                  style={{
                    color: Number(item.quantity) > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {formatQty(item.quantity)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
                >
                  <span className="inline-flex gap-1">
                    {mode === "bom_or_single" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAdd(item)}
                          className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50"
                          style={{ background: LEGACY_COLORS.blue }}
                          title="BOM 적용 — 하위 자재까지 같이 처리"
                        >
                          <Plus className="h-3 w-3" />
                          BOM 적용
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAdd(item, "manual")}
                          className="rounded-[10px] border px-2.5 py-1 text-[11px] font-black disabled:opacity-50"
                          style={{
                            background: LEGACY_COLORS.s2,
                            borderColor: LEGACY_COLORS.border,
                            color: LEGACY_COLORS.muted2,
                          }}
                          title="이 품목만 — 선택 품목만 처리"
                        >
                          이 품목만
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdd(item, "manual")}
                        className="flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50"
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
              <td colSpan={4} className="px-3 py-6">
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
            className="w-full rounded-[12px] border py-2.5 text-xs font-semibold transition-colors hover:brightness-110"
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
