export type CostStatus = "complete" | "partial" | "unavailable";
export interface ItemCostSummary {
  item_id: string; unit_cost: string | null; own_labor_cost: string | null;
  amount: string | null; status: CostStatus;
}
export interface CostIssue { item_id: string; path: string[]; code: string }
export interface CostStandards {
  standard_yield_percent?: string | null;
  standard_purchase_price: string | null;
  purchase_price_effective_date: string | null;
  standard_work_minutes: string | null;
  purchase_currency?: string;
  foreign_purchase_price?: string | null;
  purchase_exchange_rate?: string | null;
}
export interface CostNode {
  item_id: string; mes_code: string; item_name: string;
  quantity_per_parent: string; required_quantity: string;
  material_cost: string | null; own_labor_cost: string | null;
  labor_cost: string | null; unit_cost: string | null; amount: string | null;
  status: CostStatus; issues: CostIssue[]; children: CostNode[];
}
export interface ItemCost {
  yield_adjusted_unit_cost?: string | null;
  yield_cost_difference?: string | null;
  yield_stages?: CostYieldStage[];
  item_id: string; process_type_code: string; currency: "KRW"; basis: "management_standard"; can_edit: boolean;
  standards: CostStandards; hourly_labor_rate: string | null;
  material_cost: string | null; labor_cost: string | null; unit_cost: string | null;
  status: CostStatus; issues: CostIssue[]; tree: CostNode;
}
export interface CompanyCostStandards { hourly_labor_rate: string | null; can_edit: boolean }
export interface CostActor { employee_id: string; token: string }
export interface CostPurchaseInfo extends CostStandards {
  process_type_code?: string;
  item_id: string; item_name: string; mes_code: string | null; unit: string;
  supplier: string | null; supplier_item_code: string | null; purchase_memo: string | null;
  min_stock: number | null; reorder_point: number | null;
  procurement_lead_time_days: number | null; minimum_order_quantity: number | null;
  purchase_currency: string; hourly_labor_rate: string | null;
}
export type CostPurchaseInfoPatch = Partial<Omit<CostPurchaseInfo, "item_id" | "item_name" | "mes_code" | "unit" | "process_type_code">>;

export interface CostYieldStage {
  item_id: string; path: string[]; item_name: string; mes_code: string | null; process_type_code: string;
  standard_yield_percent: string | null; effective_yield_percent: string;
  input_unit_cost: string | null; output_unit_cost: string | null;
}
