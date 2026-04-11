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
  transaction_type: "RECEIVE" | "PRODUCE" | "SHIP" | "ADJUST" | "BACKFLUSH";
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reference_no: string | null;
  produced_by: string | null;
  notes: string | null;
  created_at: string;
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

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(JSON.stringify(error));
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

  createItem: async (payload: {
    item_code: string;
    item_name: string;
    spec?: string;
    category: Category;
    unit: string;
  }) => {
    const res = await fetch(`${API_BASE}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<Item>;
  },

  updateItemCategory: async (itemId: string, category: Category) => {
    const res = await fetch(`${API_BASE}/api/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<Item>;
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
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
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{
      inventory_id: string;
      item_id: string;
      quantity: string;
      location: string | null;
      updated_at: string;
    }>;
  },

  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(`${API_BASE}/api/bom/${parentItemId}`),

  getBOMTree: (parentItemId: string) =>
    fetcher<unknown>(`${API_BASE}/api/bom/${parentItemId}/tree`),

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
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<BOMEntry>;
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
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<ProductionReceiptResponse>;
  },

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<unknown>(`${API_BASE}/api/production/bom-check/${itemId}?quantity=${quantity}`),

  getTransactions: (params?: { item_id?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.item_id) query.set("item_id", params.item_id);
    if (params?.limit) query.set("limit", String(params.limit));
    return fetcher<TransactionLog[]>(`${API_BASE}/api/inventory/transactions?${query}`);
  },
};
