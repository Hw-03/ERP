const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";

export type Category =
  | "RM"
  | "TA"
  | "TF"
  | "HA"
  | "HF"
  | "VA"
  | "VF"
  | "BA"
  | "BF"
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
  | "RESERVE"
  | "RESERVE_RELEASE";
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
}

export interface InventorySummary {
  categories: CategorySummary[];
  total_items: number;
  total_quantity: number;
  uk_item_count: number;
}

export interface Item {
  item_id: string;
  item_code: string;
  item_name: string;
  spec: string | null;
  category: Category;
  unit: string;
  quantity: number;
  pending_quantity: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  barcode: string | null;
  legacy_file_type: string | null;
  legacy_part: string | null;
  legacy_item_type: string | null;
  legacy_model: string | null;
  supplier: string | null;
  min_stock: number | null;
  erp_code: string | null;
  symbol_slot: number | null;
  process_type_code: string | null;
  option_code: string | null;
  serial_no: number | null;
  created_at: string;
  updated_at: string;
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
  item_code: string | null;
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
  item_code: string | null;
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
  item_code: string | null;
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
  item_code: string | null;
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
  item_code: string | null;
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
  item_code: string | null;
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
  item_code: string;
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

export interface BOMTreeNode {
  item_id: string;
  item_code: string;
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
  item_code: string;
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
}

export interface ProductionCheckComponent {
  item_code: string;
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

export interface BackflushDetail {
  item_id: string;
  item_code: string;
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
  return `${API_BASE}${path}`;
}

async function parseError(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (typeof json.detail === "string") return json.detail;
    if (json.detail?.message) {
      const details = Array.isArray(json.detail.shortages) ? `\n${json.detail.shortages.join("\n")}` : "";
      return `${json.detail.message}${details}`;
    }
    return text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json();
}

export const api = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  getItems: (params?: {
    category?: Category;
    search?: string;
    skip?: number;
    limit?: number;
    legacyFileType?: string;
    legacyPart?: string;
    legacyModel?: string;
    legacyItemType?: string;
    barcode?: string;
  }) => {
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
    return fetcher<Item[]>(toApiUrl(`/api/items?${query}`));
  },

  getItem: (itemId: string) => fetcher<Item>(toApiUrl(`/api/items/${itemId}`)),

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
  ) => {
    const res = await fetch(toApiUrl(`/api/items/${itemId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Item>;
  },

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

  createEmployee: async (payload: {
    employee_code: string;
    name: string;
    role: string;
    phone?: string;
    department: Department;
    level?: EmployeeLevel;
    display_order?: number;
    is_active?: boolean;
  }) => {
    const res = await fetch(toApiUrl("/api/employees"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

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
      items: { item_id: string; item_code: string; item_name: string; quantity: number; stock_after: number }[];
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

  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(toApiUrl(`/api/bom/${parentItemId}/tree`)),

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

  getTransactions: (params?: {
    itemId?: string;
    transactionType?: TransactionType;
    referenceNo?: string;
    search?: string;
    limit?: number;
    skip?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.transactionType) query.set("transaction_type", params.transactionType);
    if (params?.referenceNo) query.set("reference_no", params.referenceNo);
    if (params?.search) query.set("search", params.search);
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    return fetcher<TransactionLog[]>(toApiUrl(`/api/inventory/transactions?${query}`));
  },

  updateTransactionNotes: async (logId: string, notes: string | null): Promise<TransactionLog> => {
    const res = await fetch(toApiUrl(`/api/inventory/transactions/${logId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<TransactionLog>;
  },

  getItemsExportUrl: () => toApiUrl("/api/items/export.csv"),
  getTransactionsExportUrl: () => toApiUrl("/api/inventory/transactions/export.csv"),

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
    const res = await fetch(toApiUrl("/api/queue/"), {
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
