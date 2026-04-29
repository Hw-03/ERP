import type { Item } from "@/lib/api";

export const CATEGORY_OPTIONS = [
  { value: "RM", label: "RM — 원자재" },
  { value: "TA", label: "TA — 튜브 조립" },
  { value: "HA", label: "HA — 고압 조립" },
  { value: "VA", label: "VA — 진공 조립" },
  { value: "AA", label: "AA — 최종 조립" },
  { value: "FG", label: "FG — 완제품" },
  { value: "UK", label: "UK — 미분류" },
];

export const MODEL_SLOTS = [
  { slot: 1, label: "DX3000",   symbol: "3" },
  { slot: 2, label: "COCOON",   symbol: "7" },
  { slot: 3, label: "SOLO",     symbol: "8" },
  { slot: 4, label: "ADX4000W", symbol: "4" },
  { slot: 5, label: "ADX6000",  symbol: "6" },
];

export const UNIT_OPTIONS = ["EA", "SET", "kg", "g", "m", "mm", "L", "box"];

export const PKG_CATEGORY_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RM",  label: "RM"  },
  { value: "?A",  label: "?A"  },
  { value: "?F",  label: "?F"  },
  { value: "FG",  label: "FG"  },
];

export const EMPTY_ADD_FORM = {
  item_name: "",
  category: "RM" as Item["category"],
  spec: "",
  unit: "EA",
  model_slots: [] as number[],
  option_code: "",
  legacy_item_type: "",
  supplier: "",
  min_stock: "",
  initial_quantity: "",
};

export type AddForm = typeof EMPTY_ADD_FORM;

export const EMPTY_EMPLOYEE_FORM = {
  employee_code: "",
  name: "",
  role: "",
  phone: "",
  department: "조립",
  warehouse_role: "none" as "none" | "primary" | "deputy",
};

export type EmployeeAddForm = typeof EMPTY_EMPLOYEE_FORM;

export const BOM_PARENT_CATS = ["ALL", "AA", "HA", "VA", "TA", "AF", "TF", "FG"];
export const BOM_CHILD_CATS = ["ALL", "RM", "?A", "?F"];

const ASSEMBLY_CATS = new Set(["AA", "HA", "VA", "TA"]);
const FINAL_CATS = new Set(["AF", "TF", "HF", "VF"]);

export function bomCategoryColor(cat?: string | null): string {
  if (!cat) return "var(--c-muted2)";
  if (cat === "RM") return "var(--c-green)";
  if (cat === "FG") return "var(--c-cyan)";
  if (ASSEMBLY_CATS.has(cat)) return "var(--c-blue)";
  if (FINAL_CATS.has(cat)) return "var(--c-purple)";
  return "var(--c-blue)";
}
