export const PROCESS_TYPE_OPTIONS = [
  { value: "TR", label: "TR — 튜브 원자재" }, { value: "TA", label: "TA — 튜브 중간공정" }, { value: "TF", label: "TF — 튜브 공정완료" },
  { value: "HR", label: "HR — 고압 원자재" }, { value: "HA", label: "HA — 고압 중간공정" }, { value: "HF", label: "HF — 고압 공정완료" },
  { value: "VR", label: "VR — 진공 원자재" }, { value: "VA", label: "VA — 진공 중간공정" }, { value: "VF", label: "VF — 진공 공정완료" },
  { value: "NR", label: "NR — 튜닝 원자재" }, { value: "NA", label: "NA — 튜닝 중간공정" }, { value: "NF", label: "NF — 튜닝 공정완료" },
  { value: "AR", label: "AR — 조립 원자재" }, { value: "AA", label: "AA — 조립 중간공정" }, { value: "AF", label: "AF — 조립 공정완료" },
  { value: "PR", label: "PR — 출하 원자재" }, { value: "PA", label: "PA — 출하 중간공정" }, { value: "PF", label: "PF — 출하 공정완료" },
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
  { value: "?R",  label: "원자재(?R)" },
  { value: "?A",  label: "중간공정(?A)" },
  { value: "?F",  label: "공정완료(?F)" },
];

export const EMPTY_ADD_FORM = {
  item_name: "",
  process_type_code: "TR",
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

export const BOM_PARENT_CATS = ["ALL", "AA", "HA", "VA", "TA", "NA", "PA", "AF", "TF", "HF", "VF", "NF", "PF"];
export const BOM_CHILD_CATS = ["ALL", "?R", "?A", "?F"];

export function bomCategoryColor(code?: string | null): string {
  if (!code) return "var(--c-muted2)";
  const prefix = code[0] ?? "";
  if (prefix === "T") return "var(--c-cyan)";
  if (prefix === "H") return "var(--c-yellow)";
  if (prefix === "V") return "var(--c-purple)";
  if (prefix === "N") return "#f97316";
  if (prefix === "A") return "var(--c-blue)";
  if (prefix === "P") return "var(--c-green)";
  return "var(--c-muted2)";
}
