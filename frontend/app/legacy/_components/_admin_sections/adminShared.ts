export const PROCESS_TYPE_OPTIONS = [
  { value: "TR", label: "TR — 튜브 원자재" }, { value: "TA", label: "TA — 튜브 조립체" }, { value: "TF", label: "TF — 튜브 F타입" },
  { value: "HR", label: "HR — 고압 원자재" }, { value: "HA", label: "HA — 고압 조립체" }, { value: "HF", label: "HF — 고압 F타입" },
  { value: "VR", label: "VR — 진공 원자재" }, { value: "VA", label: "VA — 진공 조립체" }, { value: "VF", label: "VF — 진공 F타입" },
  { value: "NR", label: "NR — 튜닝 원자재" }, { value: "NA", label: "NA — 튜닝 조립체" }, { value: "NF", label: "NF — 튜닝 F타입" },
  { value: "AR", label: "AR — 조립 원자재" }, { value: "AA", label: "AA — 조립 조립체" }, { value: "AF", label: "AF — 조립 F타입" },
  { value: "PR", label: "PR — 출하 원자재" }, { value: "PA", label: "PA — 출하 조립체" }, { value: "PF", label: "PF — 출하 F타입" },
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
  { value: "?A",  label: "조립체(?A)" },
  { value: "?F",  label: "F타입(?F)"  },
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
