/**
 * ERP API Client
 * FastAPI 백엔드와 통신하는 타입 안전 클라이언트
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";  // Next.js rewrites "/api/*" → backend

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Category =
  | "RM" | "TA" | "TF"
  | "HA" | "HF"
  | "VA" | "VF"
  | "BA" | "BF"
  | "FG" | "UK";

export type StockStatus = "normal" | "low" | "out";

export type TransactionType = "RECEIVE" | "PRODUCE" | "SHIP" | "ADJUST" | "BACKFLUSH";

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
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface Item {
  item_id: string;
  item_code: string;
  item_name: string;
  spec: string | null;
  category: Category;
  unit: string;
  safety_stock: number | null;
  quantity: number;
  location: string | null;
  stock_status: StockStatus;
  created_at: string;
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

export interface TransactionLog {
  log_id: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reference_no: string | null;
  produced_by: string | null;
  notes: string | null;
  created_at: string;
  // enriched fields (from /inventory/transactions)
  item_code?: string | null;
  item_name?: string | null;
  category?: Category | null;
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

export interface Employee {
  employee_id: string;
  name: string;
  department: string;
  role: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ShippingPackageItem {
  id: string;
  package_id: string;
  item_id: string;
  quantity: number;
  unit: string;
  item_code: string | null;
  item_name: string | null;
}

export interface ShippingPackage {
  package_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  package_items: ShippingPackageItem[];
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(JSON.stringify(error));
  }
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const api = {
  // ── Inventory ──────────────────────────────────────────────────────────

  getInventorySummary: () =>
    fetcher<InventorySummary>(`${API_BASE}/api/inventory/summary`),

  receiveInventory: (payload: {
    item_id: string; quantity: number; location?: string;
    reference_no?: string; produced_by?: string; notes?: string;
  }) => post<unknown>(`${API_BASE}/api/inventory/receive`, payload),

  shipInventory: (payload: {
    item_id: string; quantity: number;
    reference_no?: string; produced_by?: string; notes?: string;
  }) => post<unknown>(`${API_BASE}/api/inventory/ship`, payload),

  adjustInventory: (payload: {
    item_id: string; quantity_absolute: number;
    reference_no?: string; produced_by?: string; notes?: string;
  }) => post<unknown>(`${API_BASE}/api/inventory/adjust`, payload),

  // ── Transactions ────────────────────────────────────────────────────────

  getTransactions: (params?: {
    item_id?: string;
    transaction_type?: TransactionType;
    produced_by?: string;
    reference_no?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    skip?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.item_id)          query.set("item_id", params.item_id);
    if (params?.transaction_type) query.set("transaction_type", params.transaction_type);
    if (params?.produced_by)      query.set("produced_by", params.produced_by);
    if (params?.reference_no)     query.set("reference_no", params.reference_no);
    if (params?.date_from)        query.set("date_from", params.date_from);
    if (params?.date_to)          query.set("date_to", params.date_to);
    if (params?.limit)            query.set("limit", String(params.limit));
    if (params?.skip)             query.set("skip", String(params.skip));
    return fetcher<TransactionLog[]>(`${API_BASE}/api/inventory/transactions?${query}`);
  },

  // ── Items ───────────────────────────────────────────────────────────────

  getItems: (params?: {
    category?: Category;
    search?: string;
    limit?: number;
    skip?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.search)   query.set("search", params.search);
    if (params?.limit)    query.set("limit", String(params.limit));
    if (params?.skip)     query.set("skip", String(params.skip));
    return fetcher<Item[]>(`${API_BASE}/api/items?${query}`);
  },

  getItem: (item_id: string) =>
    fetcher<Item>(`${API_BASE}/api/items/${item_id}`),

  createItem: (payload: {
    item_code: string; item_name: string; spec?: string;
    category: Category; unit: string; safety_stock?: number;
  }) => post<Item>(`${API_BASE}/api/items`, payload),

  updateItem: (item_id: string, payload: {
    item_name?: string; spec?: string; category?: Category;
    unit?: string; safety_stock?: number | null;
  }) => put<Item>(`${API_BASE}/api/items/${item_id}`, payload),

  deleteItem: (item_id: string) => del(`${API_BASE}/api/items/${item_id}`),

  // ── BOM ─────────────────────────────────────────────────────────────────

  getBOM: (parent_item_id: string) =>
    fetcher<BOMEntry[]>(`${API_BASE}/api/bom/${parent_item_id}`),

  getBOMTree: (parent_item_id: string) =>
    fetcher<unknown>(`${API_BASE}/api/bom/${parent_item_id}/tree`),

  createBOM: (payload: {
    parent_item_id: string; child_item_id: string;
    quantity: number; unit: string; notes?: string;
  }) => post<BOMEntry>(`${API_BASE}/api/bom`, payload),

  // ── Production ──────────────────────────────────────────────────────────

  productionReceipt: (payload: {
    item_id: string; quantity: number;
    reference_no?: string; produced_by?: string; notes?: string;
  }) => post<ProductionReceiptResponse>(`${API_BASE}/api/production/receipt`, payload),

  checkProduction: (item_id: string, quantity: number) =>
    fetcher<unknown>(`${API_BASE}/api/production/bom-check/${item_id}?quantity=${quantity}`),

  // ── Employees ────────────────────────────────────────────────────────────

  getEmployees: (params?: { active_only?: boolean; department?: string }) => {
    const query = new URLSearchParams();
    if (params?.active_only !== undefined) query.set("active_only", String(params.active_only));
    if (params?.department) query.set("department", params.department);
    return fetcher<Employee[]>(`${API_BASE}/api/employees?${query}`);
  },

  createEmployee: (payload: {
    name: string; department: string; role?: string; phone?: string;
  }) => post<Employee>(`${API_BASE}/api/employees`, payload),

  updateEmployee: (employee_id: string, payload: {
    name?: string; department?: string; role?: string;
    phone?: string; is_active?: boolean;
  }) => put<Employee>(`${API_BASE}/api/employees/${employee_id}`, payload),

  deleteEmployee: (employee_id: string) =>
    del(`${API_BASE}/api/employees/${employee_id}`),

  // ── Shipping Packages ────────────────────────────────────────────────────

  getShippingPackages: () =>
    fetcher<ShippingPackage[]>(`${API_BASE}/api/shipping`),

  createShippingPackage: (payload: {
    name: string; notes?: string;
    items: { item_id: string; quantity: number; unit?: string }[];
  }) => post<ShippingPackage>(`${API_BASE}/api/shipping`, payload),

  addPackageItem: (package_id: string, payload: {
    item_id: string; quantity: number; unit?: string;
  }) => post<ShippingPackage>(`${API_BASE}/api/shipping/${package_id}/items`, payload),

  removePackageItem: (package_id: string, item_id: string) =>
    del(`${API_BASE}/api/shipping/${package_id}/items/${item_id}`),

  shipPackage: (payload: {
    package_id: string; reference_no?: string;
    produced_by?: string; notes?: string;
  }) => post<{ message: string }>(`${API_BASE}/api/shipping/ship`, payload),

  deleteShippingPackage: (package_id: string) =>
    del(`${API_BASE}/api/shipping/${package_id}`),
};
