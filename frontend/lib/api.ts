const SERVER_API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";

const FALLBACK_SERVER_API_BASE = "http://127.0.0.1:8000";

export type Category =
  | "RM"
  | "TA"
  | "TF"
  | "HA"
  | "HF"
  | "VA"
  | "VF"
  | "AA"
  | "AF"
  | "FG"
  | "UK";

export type TransactionType =
  | "RECEIVE"
  | "PRODUCE"
  | "SHIP"
  | "ADJUST"
  | "BACKFLUSH"
  | "SCRAP"
  | "LOSS"
  | "DISASSEMBLE"
  | "RETURN"
  | "TRANSFER_TO_PROD"
  | "TRANSFER_TO_WH"
  | "TRANSFER_DEPT"
  | "MARK_DEFECTIVE"
  | "SUPPLIER_RETURN";

export type LocationStatus = "PRODUCTION" | "DEFECTIVE";

export interface InventoryLocationRow {
  department: Department;
  status: LocationStatus;
  quantity: number;
}
export type Department =
  | "조립"
  | "고압"
  | "진공"
  | "튜닝"
  | "튜브"
  | "AS"
  | "연구"
  | "영업"
  | "출하"
  | "기타";
export type EmployeeLevel = "admin" | "manager" | "staff";

export interface CategorySummary {
  category: Category;
  category_label: string;
  item_count: number;
  total_quantity: number;
  warehouse_qty_sum?: number;
  production_qty_sum?: number;
  defective_qty_sum?: number;
}

export interface InventorySummary {
  categories: CategorySummary[];
  total_items: number;
  total_quantity: number;
  uk_item_count: number;
}

export interface ProductModel {
  slot: number;
  symbol: string | null;
  model_name: string | null;
  is_reserved: boolean;
}

export interface Item {
  item_id: string;
  item_name: string;
  spec: string | null;
  category: Category;
  unit: string;
  quantity: number;
  warehouse_qty: number;
  production_total: number;
  defective_total: number;
  pending_quantity: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  barcode: string | null;
  legacy_file_type: string | null;
  legacy_part: string | null;
  legacy_item_type: string | null;
  legacy_model: string | null;
  supplier: string | null;
  min_stock: number | null;
  erp_code: string | null;
  model_symbol: string | null;
  model_slots: number[];
  symbol_slot: number | null;
  process_type_code: string | null;
  option_code: string | null;
  serial_no: number | null;
  created_at: string;
  updated_at: string;
  department: string | null;
}

// =============================================================================
// Queue / Scrap / Loss / Variance / Alerts / Counts (M4-M6)
// =============================================================================

export type QueueBatchType = "PRODUCE" | "DISASSEMBLE" | "RETURN";
export type QueueBatchStatus = "OPEN" | "CONFIRMED" | "CANCELLED";
export type QueueLineDirection = "IN" | "OUT" | "SCRAP" | "LOSS";

export interface QueueLine {
  line_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  direction: QueueLineDirection;
  quantity: number;
  bom_expected: number | null;
  reason: string | null;
  process_stage: string | null;
  included: boolean;
  created_at: string;
}

export interface QueueBatch {
  batch_id: string;
  batch_type: QueueBatchType;
  status: QueueBatchStatus;
  owner_employee_id: string | null;
  owner_name: string | null;
  parent_item_id: string | null;
  parent_item_name: string | null;
  parent_quantity: number | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  lines: QueueLine[];
}

export type AlertKind = "SAFETY" | "COUNT_VARIANCE";

export interface StockAlert {
  alert_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  kind: AlertKind;
  threshold: number | null;
  observed_value: number | null;
  message: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface PhysicalCount {
  count_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  counted_qty: number;
  system_qty: number;
  diff: number;
  reason: string | null;
  operator: string | null;
  created_at: string;
}

export interface ScrapLogRow {
  scrap_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  process_stage: string | null;
  reason: string;
  batch_id: string | null;
  operator: string | null;
  created_at: string;
}

export interface LossLogRow {
  loss_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  batch_id: string | null;
  reason: string;
  operator: string | null;
  created_at: string;
}

export interface VarianceLogRow {
  var_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  bom_expected: number;
  actual_used: number;
  diff: number;
  note: string | null;
  created_at: string;
}

export interface Employee {
  employee_id: string;
  employee_code: string;
  name: string;
  role: string;
  phone: string | null;
  department: Department;
  level: EmployeeLevel;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShipPackageItemDetail {
  package_item_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string;
  item_category: Category;
  item_unit: string;
  quantity: number;
}

export interface ShipPackage {
  package_id: string;
  package_code: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: ShipPackageItemDetail[];
}

export interface InventoryMutationResponse {
  inventory_id: string;
  item_id: string;
  quantity: string;
  location: string | null;
  updated_at: string;
}

export interface BOMEntry {
  bom_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export interface BOMDetailEntry {
  bom_id: string;
  parent_item_id: string;
  parent_item_name: string;
  parent_erp_code: string | null;
  child_item_id: string;
  child_item_name: string;
  child_erp_code: string | null;
  quantity: number;
  unit: string;
}

export interface BOMTreeNode {
  item_id: string;
  erp_code: string;
  item_name: string;
  category: Category;
  unit: string;
  required_quantity: number;
  current_stock: number;
  children: BOMTreeNode[];
}

export interface TransactionLog {
  log_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string;
  item_category: Category;
  item_unit: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reference_no: string | null;
  produced_by: string | null;
  notes: string | null;
  created_at: string;
  edit_count?: number;  // 3차: 수정 이력 개수 (서버 응답에 포함)
}

/** 거래 수정 이력 (3차 메타 수정 + 4차 수량 보정 공통). */
export interface TransactionEditLog {
  edit_id: string;
  original_log_id: string;
  edited_by_employee_id: string;
  edited_by_name: string;
  reason: string;
  before_payload: string;  // JSON string
  after_payload: string;   // JSON string
  correction_log_id: string | null;
  created_at: string;
}

export interface ProductionCheckComponent {
  erp_code: string | null;
  item_name: string;
  category: Category;
  unit: string;
  required: number;
  current_stock: number;
  shortage: number;
  ok: boolean;
}

export interface ProductionCheckResponse {
  item_id: string;
  item_name: string;
  quantity_to_produce: number;
  can_produce: boolean;
  components: ProductionCheckComponent[];
}

export interface ProductionCapacityItem {
  item_id: string;
  item_name: string;
  erp_code: string | null;
  immediate: number;
  maximum: number;
}

export interface ProductionCapacity {
  immediate: number;
  maximum: number;
  limiting_item: string | null;
  top_items: ProductionCapacityItem[];
}

export interface BackflushDetail {
  item_id: string;
  erp_code: string | null;
  item_name: string;
  category: Category;
  required_quantity: number;
  stock_before: number;
  stock_after: number;
}

export interface ProductionReceiptResponse {
  success: boolean;
  message: string;
  produced_item_id: string;
  produced_item_name: string;
  produced_quantity: number;
  reference_no: string | null;
  backflushed_components: BackflushDetail[];
  transaction_ids: string[];
}

function toApiUrl(path: string) {
  // When an explicit API base is configured, always honor it.
  if (SERVER_API_BASE) {
    return `${SERVER_API_BASE}${path}`;
  }

  // Use relative path so Next.js rewrites forward to backend.
  // Works on LAN, NAS, and external access without hardcoding ports.
  return path;
}

/** 백엔드 detail 구조에서 사용자 표시용 메시지 추출.
 *
 * 지원하는 detail 모양:
 * - 문자열: "품목을 찾을 수 없습니다."
 * - 구 dict: {message, shortages?}
 * - 신 dict (Phase 4): {code, message, extra?: {shortages?}}
 *
 * shortages 가 있으면 줄바꿈으로 추가한다.
 */
export function extractErrorMessage(detail: unknown, fallback = "처리 실패"): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const msg = typeof d.message === "string" ? d.message : null;
    if (!msg) return fallback;

    let shortages: unknown = d.shortages;
    if (!Array.isArray(shortages) && d.extra && typeof d.extra === "object") {
      shortages = (d.extra as Record<string, unknown>).shortages;
    }
    const tail = Array.isArray(shortages) && shortages.length
      ? `\n${shortages.join("\n")}`
      : "";
    return `${msg}${tail}`;
  }
  return fallback;
}

async function parseError(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return extractErrorMessage(json?.detail, text || res.statusText);
  } catch {
    return text || res.statusText;
  }
}

export async function fetcher<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new Error(
      error instanceof Error
        ? `API 연결에 실패했습니다. ${url} 주소에 접근할 수 있는지 확인해 주세요.`
        : "API 연결에 실패했습니다.",
    );
  }
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json();
}

// 5.3-B: 쓰기 응답 타입 캐스팅을 한 곳으로. createItem/updateItem/createEmployee 등이 사용.
async function writeJson<T>(url: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export const postJson = <T>(url: string, body: unknown): Promise<T> => writeJson<T>(url, "POST", body);
export const putJson = <T>(url: string, body: unknown): Promise<T> => writeJson<T>(url, "PUT", body);
export const patchJson = <T>(url: string, body: unknown): Promise<T> => writeJson<T>(url, "PATCH", body);

export const api = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  getItems: (
    params?: {
      category?: Category;
      search?: string;
      skip?: number;
      limit?: number;
      legacyFileType?: string;
      legacyPart?: string;
      legacyModel?: string;
      legacyItemType?: string;
      barcode?: string;
      department?: string;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.search) query.set("search", params.search);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.legacyFileType) query.set("legacy_file_type", params.legacyFileType);
    if (params?.legacyPart) query.set("legacy_part", params.legacyPart);
    if (params?.legacyModel) query.set("legacy_model", params.legacyModel);
    if (params?.legacyItemType) query.set("legacy_item_type", params.legacyItemType);
    if (params?.barcode) query.set("barcode", params.barcode);
    if (params?.department) query.set("department", params.department);
    return fetcher<Item[]>(toApiUrl(`/api/items?${query}`), opts?.signal);
  },

  getItem: (itemId: string) => fetcher<Item>(toApiUrl(`/api/items/${itemId}`)),

  createItem: async (payload: {
    item_name: string;
    category: Category;
    spec?: string;
    unit?: string;
    legacy_model?: string;
    legacy_item_type?: string;
    supplier?: string;
    min_stock?: number;
    initial_quantity?: number;
    model_slots?: number[];
    option_code?: string;
  }) => postJson<Item>(toApiUrl("/api/items"), payload),

  updateItem: async (
    itemId: string,
    payload: {
      item_name?: string;
      spec?: string;
      category?: Category;
      unit?: string;
      barcode?: string;
      legacy_file_type?: string;
      legacy_part?: string;
      legacy_item_type?: string;
      legacy_model?: string;
      supplier?: string;
      min_stock?: number;
    },
  ) => putJson<Item>(toApiUrl(`/api/items/${itemId}`), payload),

  verifyAdminPin: async (pin: string) => {
    const res = await fetch(toApiUrl("/api/settings/verify-pin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },

  resetDatabase: async (pin: string) => {
    const res = await fetch(toApiUrl("/api/settings/reset"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },

  updateAdminPin: async (payload: { current_pin: string; new_pin: string }) => {
    const res = await fetch(toApiUrl("/api/settings/admin-pin"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ message: string }>;
  },

  getEmployees: (params?: { department?: Department; activeOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.department) query.set("department", params.department);
    if (params?.activeOnly !== undefined) query.set("active_only", String(params.activeOnly));
    return fetcher<Employee[]>(toApiUrl(`/api/employees?${query}`));
  },

  createEmployee: (payload: {
    employee_code: string;
    name: string;
    role: string;
    phone?: string;
    department: Department;
    level?: EmployeeLevel;
    display_order?: number;
    is_active?: boolean;
  }) => postJson<Employee>(toApiUrl("/api/employees"), payload),

  updateEmployee: async (
    employeeId: string,
    payload: {
      name?: string;
      role?: string;
      phone?: string;
      department?: Department;
      level?: EmployeeLevel;
      display_order?: number;
      is_active?: boolean;
    },
  ) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

  deleteEmployee: async (employeeId: string) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  // 작업자 식별용 PIN 검증 — 실제 보안 인증이 아님
  verifyEmployeePin: async (employeeId: string, pin: string) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}/verify-pin`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

  // PIN 0000으로 초기화 — 관리자 작업
  resetEmployeePin: async (employeeId: string) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}/reset-pin`), {
      method: "POST",
    });
    if (!res.ok) throw new Error(await parseError(res));
  },

  getModels: () => fetcher<ProductModel[]>(toApiUrl("/api/models")),

  createModel: async (payload: { model_name: string; symbol?: string }) => {
    const res = await fetch(toApiUrl("/api/models"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ProductModel>;
  },

  deleteModel: async (slot: number) => {
    const res = await fetch(toApiUrl(`/api/models/${slot}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  getShipPackages: () => fetcher<ShipPackage[]>(toApiUrl("/api/ship-packages")),

  createShipPackage: async (payload: { package_code: string; name: string; notes?: string }) => {
    const res = await fetch(toApiUrl("/api/ship-packages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  updateShipPackage: async (packageId: string, payload: { name?: string; notes?: string }) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackage: async (packageId: string) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  addShipPackageItem: async (packageId: string, payload: { item_id: string; quantity: number }) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}/items`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackageItem: async (packageId: string, packageItemId: string) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}/items/${packageItemId}`), {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  receiveInventory: async (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/receive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  shipInventory: async (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/ship"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  shipPackage: async (payload: {
    package_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/ship-package"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{
      message: string;
      package_name: string;
      quantity: number;
      items: { item_id: string; erp_code: string | null; item_name: string; quantity: number; stock_after: number }[];
    }>;
  },

  adjustInventory: async (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    location?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/adjust"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferToProduction: async (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-to-production"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferToWarehouse: async (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-to-warehouse"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferBetweenDepts: async (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    to_department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-between-depts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  markDefective: async (payload: {
    item_id: string;
    quantity: number;
    source: "warehouse" | "production";
    source_department?: Department;
    target_department: Department;
    reason?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/mark-defective"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  returnToSupplier: async (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    reference_no?: string;
    notes?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/return-to-supplier"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  getItemLocations: (itemId: string) =>
    fetcher<InventoryLocationRow[]>(toApiUrl(`/api/inventory/locations/${itemId}`)),

  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(toApiUrl(`/api/bom/${parentItemId}/tree`)),
  /** 주어진 품목을 자식으로 사용하는 parent BOM 행. 직접 사용처(1단계). */
  getBOMWhereUsed: (itemId: string) =>
    fetcher<BOMDetailEntry[]>(toApiUrl(`/api/bom/where-used/${itemId}`)),

  createBOM: async (payload: {
    parent_item_id: string;
    child_item_id: string;
    quantity: number;
    unit: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/bom"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<BOMEntry>;
  },

  deleteBOM: async (bomId: string) => {
    const res = await fetch(toApiUrl(`/api/bom/${bomId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  updateBOM: async (bomId: string, payload: { quantity?: number; unit?: string }) => {
    const res = await fetch(toApiUrl(`/api/bom/${bomId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<BOMEntry>;
  },

  productionReceipt: async (payload: {
    item_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/production/receipt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ProductionReceiptResponse>;
  },

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<ProductionCheckResponse>(toApiUrl(`/api/production/bom-check/${itemId}?quantity=${quantity}`)),

  getProductionCapacity: () =>
    fetcher<ProductionCapacity>(toApiUrl("/api/production/capacity")),

  getTransactions: (
    params?: {
      itemId?: string;
      transactionType?: TransactionType;
      referenceNo?: string;
      search?: string;
      limit?: number;
      skip?: number;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.transactionType) query.set("transaction_type", params.transactionType);
    if (params?.referenceNo) query.set("reference_no", params.referenceNo);
    if (params?.search) query.set("search", params.search);
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    return fetcher<TransactionLog[]>(toApiUrl(`/api/inventory/transactions?${query}`), opts?.signal);
  },

  /** 거래 메타데이터(notes/reference_no/produced_by) 수정. reason + PIN 필수. */
  metaEditTransaction: async (
    logId: string,
    payload: {
      notes?: string | null;
      reference_no?: string | null;
      produced_by?: string | null;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ): Promise<TransactionLog> => {
    const res = await fetch(toApiUrl(`/api/inventory/transactions/${logId}/meta-edit`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<TransactionLog>;
  },

  /** 특정 거래의 수정 이력 (최신순). */
  getTransactionEdits: (logId: string): Promise<TransactionEditLog[]> =>
    fetcher<TransactionEditLog[]>(toApiUrl(`/api/inventory/transactions/${logId}/edits`)),

  /** RECEIVE/SHIP 수량 보정. SHIP은 quantity_change가 음수여야 함. */
  quantityCorrectTransaction: async (
    logId: string,
    payload: {
      quantity_change: number;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ): Promise<{ original: TransactionLog; correction: TransactionLog }> => {
    const res = await fetch(
      toApiUrl(`/api/inventory/transactions/${logId}/quantity-correction`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ original: TransactionLog; correction: TransactionLog }>;
  },

  getItemsExportUrl: (params?: { category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs}` : "";
    return toApiUrl(`/api/items/export.xlsx${suffix}`);
  },
  getTransactionsExportUrl: (params?: {
    transaction_type?: string;
    search?: string;
    start_date?: string; // YYYY-MM-DD
    end_date?: string;   // YYYY-MM-DD
  }) => {
    const qs = new URLSearchParams();
    if (params?.transaction_type) qs.set("transaction_type", params.transaction_type);
    if (params?.search) qs.set("search", params.search);
    // backend export endpoint 가 start_date/end_date 둘 다 필수.
    // 미지정 시 최근 30일(오늘 포함, D-29 ~ 오늘)을 자동 부여한다.
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    qs.set("start_date", params?.start_date ?? ymd(from));
    qs.set("end_date", params?.end_date ?? ymd(today));
    return toApiUrl(`/api/inventory/transactions/export.xlsx?${qs}`);
  },

  // Queue batches ------------------------------------------------------------
  createQueueBatch: async (payload: {
    batch_type: QueueBatchType;
    parent_item_id?: string;
    parent_quantity?: number;
    owner_employee_id?: string;
    owner_name?: string;
    reference_no?: string;
    notes?: string;
    load_bom?: boolean;
  }) => {
    const res = await fetch(toApiUrl("/api/queue"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  listQueueBatches: (params?: { status?: QueueBatchStatus; ownerEmployeeId?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.ownerEmployeeId) query.set("owner_employee_id", params.ownerEmployeeId);
    return fetcher<QueueBatch[]>(toApiUrl(`/api/queue/?${query}`));
  },

  getQueueBatch: (batchId: string) => fetcher<QueueBatch>(toApiUrl(`/api/queue/${batchId}`)),

  overrideQueueLine: async (batchId: string, lineId: string, quantity: number) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  toggleQueueLine: async (
    batchId: string,
    lineId: string,
    payload: { included: boolean; new_direction?: QueueLineDirection },
  ) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}/toggle`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  addQueueLine: async (
    batchId: string,
    payload: {
      item_id: string;
      direction: QueueLineDirection;
      quantity: number;
      reason?: string;
      process_stage?: string;
    },
  ) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  deleteQueueLine: async (batchId: string, lineId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/lines/${lineId}`), {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  confirmQueueBatch: async (batchId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/confirm`), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  cancelQueueBatch: async (batchId: string) => {
    const res = await fetch(toApiUrl(`/api/queue/${batchId}/cancel`), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<QueueBatch>;
  },

  // Scrap / Loss / Variance --------------------------------------------------
  recordScrap: async (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    process_stage?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/scrap/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ScrapLogRow>;
  },

  listScrap: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<ScrapLogRow[]>(toApiUrl(`/api/scrap/?${query}`));
  },

  recordLoss: async (
    payload: { item_id: string; quantity: number; reason: string; operator?: string },
    deduct = false,
  ) => {
    const res = await fetch(toApiUrl(`/api/loss/?deduct=${deduct}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<LossLogRow>;
  },

  listLoss: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<LossLogRow[]>(toApiUrl(`/api/loss/?${query}`));
  },

  listVariance: (params?: { itemId?: string; batchId?: string }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.batchId) query.set("batch_id", params.batchId);
    return fetcher<VarianceLogRow[]>(toApiUrl(`/api/variance/?${query}`));
  },

  // Alerts -------------------------------------------------------------------
  scanSafetyAlerts: async () => {
    const res = await fetch(toApiUrl("/api/alerts/scan"), { method: "POST" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockAlert[]>;
  },

  listAlerts: (params?: {
    kind?: AlertKind;
    includeAcknowledged?: boolean;
    itemId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.kind) query.set("kind", params.kind);
    if (params?.includeAcknowledged !== undefined)
      query.set("include_acknowledged", String(params.includeAcknowledged));
    if (params?.itemId) query.set("item_id", params.itemId);
    return fetcher<StockAlert[]>(toApiUrl(`/api/alerts/?${query}`));
  },

  acknowledgeAlert: async (alertId: string, acknowledgedBy?: string) => {
    const res = await fetch(toApiUrl(`/api/alerts/${alertId}/acknowledge`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged_by: acknowledgedBy ?? null }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockAlert>;
  },

  // Physical counts ---------------------------------------------------------
  submitPhysicalCount: async (payload: {
    item_id: string;
    counted_qty: number;
    reason?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/counts/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<PhysicalCount>;
  },

  listPhysicalCounts: (itemId?: string) => {
    const query = new URLSearchParams();
    if (itemId) query.set("item_id", itemId);
    return fetcher<PhysicalCount[]>(toApiUrl(`/api/counts/?${query}`));
  },
};
