// 모바일 관리자 5섹션이 공유하는 상수.
// 과거 AdminTab.tsx 에서 분할되어 나왔다가 5.2 의 AdminShell 패턴으로 대체됨.

export const CATEGORY_OPTIONS = [
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
