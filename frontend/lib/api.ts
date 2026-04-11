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

export type TransactionType = "RECEIVE" | "PRODUCE" | "SHIP" | "ADJUST" | "BACKFLUSH";
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
  location: string | null;
  created_at: string;
  updated_at: string;
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
  getInventorySummary: () => fetcher<InventorySummary>(`${API_BASE}/api/inventory/summary`),

  getItems: (params?: {
    category?: Category;
    search?: string;
    skip?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.search) query.set("search", params.search);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    return fetcher<Item[]>(`${API_BASE}/api/items?${query}`);
  },

  getItem: (itemId: string) => fetcher<Item>(`${API_BASE}/api/items/${itemId}`),

  updateItem: async (
    itemId: string,
    payload: {
      item_name?: string;
      spec?: string;
      category?: Category;
      unit?: string;
    },
  ) => {
    const res = await fetch(`${API_BASE}/api/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Item>;
  },

  getEmployees: (params?: { department?: Department; activeOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.department) query.set("department", params.department);
    if (params?.activeOnly !== undefined) query.set("active_only", String(params.activeOnly));
    return fetcher<Employee[]>(`${API_BASE}/api/employees?${query}`);
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
    const res = await fetch(`${API_BASE}/api/employees`, {
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
    const res = await fetch(`${API_BASE}/api/employees/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

  deleteEmployee: async (employeeId: string) => {
    const res = await fetch(`${API_BASE}/api/employees/${employeeId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  getShipPackages: () => fetcher<ShipPackage[]>(`${API_BASE}/api/ship-packages`),

  createShipPackage: async (payload: { package_code: string; name: string; notes?: string }) => {
    const res = await fetch(`${API_BASE}/api/ship-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  updateShipPackage: async (packageId: string, payload: { name?: string; notes?: string }) => {
    const res = await fetch(`${API_BASE}/api/ship-packages/${packageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackage: async (packageId: string) => {
    const res = await fetch(`${API_BASE}/api/ship-packages/${packageId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  addShipPackageItem: async (packageId: string, payload: { item_id: string; quantity: number }) => {
    const res = await fetch(`${API_BASE}/api/ship-packages/${packageId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackageItem: async (packageId: string, packageItemId: string) => {
    const res = await fetch(`${API_BASE}/api/ship-packages/${packageId}/items/${packageItemId}`, {
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
    const res = await fetch(`${API_BASE}/api/inventory/receive`, {
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
    const res = await fetch(`${API_BASE}/api/inventory/ship`, {
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
    const res = await fetch(`${API_BASE}/api/inventory/ship-package`, {
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
    const res = await fetch(`${API_BASE}/api/inventory/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(`${API_BASE}/api/bom/${parentItemId}`),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(`${API_BASE}/api/bom/${parentItemId}/tree`),

  createBOM: async (payload: {
    parent_item_id: string;
    child_item_id: string;
    quantity: number;
    unit: string;
    notes?: string;
  }) => {
    const res = await fetch(`${API_BASE}/api/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<BOMEntry>;
  },

  deleteBOM: async (bomId: string) => {
    const res = await fetch(`${API_BASE}/api/bom/${bomId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  productionReceipt: async (payload: {
    item_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(`${API_BASE}/api/production/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ProductionReceiptResponse>;
  },

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<ProductionCheckResponse>(
      `${API_BASE}/api/production/bom-check/${itemId}?quantity=${quantity}`,
    ),

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
    return fetcher<TransactionLog[]>(`${API_BASE}/api/inventory/transactions?${query}`);
  },
};
