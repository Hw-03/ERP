/**
 * Query key 표준 — W4-A.
 *
 * 모든 React Query 호출자는 이곳의 key를 사용해야 한다.
 * 도메인별로 `all` (전체 invalidate용)과 세부 key를 노출.
 *
 * 후속 도메인 (departments, employees, items, inventory, ...)은 점진 추가.
 */

export const queryKeys = {
  models: {
    all: ["models"] as const,
    list: () => ["models", "list"] as const,
    detail: (slot: number) => ["models", "detail", slot] as const,
  },
  departments: {
    all: ["departments"] as const,
    list: (params?: { isActive?: boolean }) =>
      ["departments", "list", params ?? {}] as const,
    detail: (id: number) => ["departments", "detail", id] as const,
  },
  employees: {
    all: ["employees"] as const,
    list: (params?: { department?: string; activeOnly?: boolean }) =>
      ["employees", "list", params ?? {}] as const,
    detail: (employeeId: string) => ["employees", "detail", employeeId] as const,
  },
  items: {
    all: ["items"] as const,
    list: (params?: {
      process_type_code?: string;
      search?: string;
      skip?: number;
      limit?: number;
      legacyPart?: string;
      legacyItemType?: string;
      department?: string;
    }) => ["items", "list", params ?? {}] as const,
    detail: (itemId: string) => ["items", "detail", itemId] as const,
  },
  shipping: {
    all: ["shipping"] as const,
    requests: (params?: { status?: string }) =>
      ["shipping", "requests", params ?? {}] as const,
  },
  weekly: {
    all: ["weekly"] as const,
    report: (weekStart: string, weekEnd: string) =>
      ["weekly", "report", weekStart, weekEnd] as const,
  },
  warehouseMap: {
    all: ["warehouseMap"] as const,
    map: () => ["warehouseMap", "map"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    list: (params?: object) => ["transactions", "list", params ?? {}] as const,
    displayGroups: (params?: object) => ["transactions", "displayGroups", params ?? {}] as const,
    summary: (params?: object) => ["transactions", "summary", params ?? {}] as const,
    referenceSummaries: (params?: object) => ["transactions", "referenceSummaries", params ?? {}] as const,
    edits: (logId: string) => ["transactions", "edits", logId] as const,
    monthlyCounts: (year: number) => ["transactions", "monthlyCounts", year] as const,
  },
  bom: {
    all: ["bom"] as const,
    list: () => ["bom", "list"] as const,
    detail: (parentId: string) => ["bom", "detail", parentId] as const,
    tree: (parentId: string) => ["bom", "tree", parentId] as const,
    whereUsed: (itemId: string) => ["bom", "whereUsed", itemId] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    summary: () => ["inventory", "summary"] as const,
    locations: (itemId: string) => ["inventory", "locations", itemId] as const,
  },
  settings: {
    all: ["settings"] as const,
    auditCsvList: () => ["settings", "auditCsvList"] as const,
  },
  stockRequests: {
    all: ["stockRequests"] as const,
    warehouseQueue: () => ["stockRequests", "warehouseQueue"] as const,
    departmentQueue: (actorId: string) =>
      ["stockRequests", "departmentQueue", actorId] as const,
    myList: (employeeId: string) =>
      ["stockRequests", "myList", employeeId] as const,
    drafts: (employeeId: string) =>
      ["stockRequests", "drafts", employeeId] as const,
    reservations: (itemId: string) =>
      ["stockRequests", "reservations", itemId] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (employeeId: string) => ["notifications", "list", employeeId] as const,
  },
  production: {
    all: ["production"] as const,
    capacity: () => ["production", "capacity"] as const,
    pfPins: () => ["production", "pfPins"] as const,
    transactions: (params?: object) =>
      ["production", "transactions", params ?? {}] as const,
    transactionEdits: (logId: string) =>
      ["production", "transactionEdits", logId] as const,
  },
  admin: {
    all: ["admin"] as const,
    auditCsvList: () => ["admin", "auditCsvList"] as const,
  },
  myItemOrder: {
    all: ["myItemOrder"] as const,
    byEmployee: (employeeId: string) => ["myItemOrder", employeeId] as const,
  },
} as const;
