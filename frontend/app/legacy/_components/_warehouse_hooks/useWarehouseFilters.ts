"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item, ShipPackage } from "@/lib/api";
import { PAGE_SIZE, matchesSearch } from "../_warehouse_steps";

type Args = {
  items: Item[];
  packages: ShipPackage[];
  selectedItems: Map<string, number>;
  globalSearch: string;
  isPackageMode: boolean;
};

export function useWarehouseFilters({
  items,
  packages,
  selectedItems,
  globalSearch,
  isPackageMode,
}: Args) {
  const [localSearch, setLocalSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("전체");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          if (dept === "ALL") return true;
          if (dept === "창고") return (item.warehouse_qty ?? 0) > 0;
          return item.locations?.some((loc) => loc.department === dept && loc.quantity > 0) ?? false;
        })
        .filter((item) => modelFilter === "전체" || item.legacy_model === modelFilter)
        .filter((item) => {
          if (stageFilter === "ALL") return true;
          if (stageFilter === "RAW") return item.process_type_code?.endsWith("R") ?? false;
          if (stageFilter === "MID") return item.process_type_code?.endsWith("A") ?? false;
          if (stageFilter === "DONE") return item.process_type_code?.endsWith("F") ?? false;
          return true;
        })
        .filter((item) => matchesSearch(item, searchKeyword)),
    [items, dept, modelFilter, stageFilter, searchKeyword],
  );

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [dept, modelFilter, stageFilter, localSearch, globalSearch]);

  const filteredPackages = useMemo(
    () =>
      packages.filter((pkg) =>
        searchKeyword ? `${pkg.name} ${pkg.package_code}`.toLowerCase().includes(searchKeyword) : true,
      ),
    [packages, searchKeyword],
  );

  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((it) => it.item_id)),
    [filteredItems],
  );

  const hiddenSelectedCount = useMemo(
    () =>
      isPackageMode
        ? 0
        : Array.from(selectedItems.keys()).filter((id) => !filteredItemIds.has(id)).length,
    [selectedItems, filteredItemIds, isPackageMode],
  );

  const hasActiveFilter =
    !isPackageMode
    && (dept !== "ALL" || modelFilter !== "전체" || stageFilter !== "ALL" || !!localSearch);

  function clearFilters() {
    setDept("ALL");
    setModelFilter("전체");
    setStageFilter("ALL");
    setLocalSearch("");
  }

  return {
    localSearch,
    setLocalSearch,
    dept,
    setDept,
    modelFilter,
    setModelFilter,
    stageFilter,
    setStageFilter,
    displayLimit,
    setDisplayLimit,
    searchKeyword,
    filteredItems,
    filteredPackages,
    hiddenSelectedCount,
    hasActiveFilter,
    clearFilters,
  };
}
