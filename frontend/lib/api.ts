// 5.6-A: fetch wrapper / URL 빌더 / 에러 파서를 lib/api-core.ts 로 분리.
//        외부 import 호환을 위해 동일 이름을 re-export 한다.
import {
  toApiUrl,
  extractErrorMessage,
  parseError,
  fetcher,
  postJson,
  putJson,
  patchJson,
  FALLBACK_SERVER_API_BASE,
} from "./api-core";

// R5-5: 도메인별 API 분리 시작 (items).
import { itemsApi } from "./api/items";
// R6-D1: inventory 도메인 분리.
import { inventoryApi } from "./api/inventory";
// R6-D2: employees 도메인 분리.
import { employeesApi } from "./api/employees";
// R6-D3: admin / settings 도메인 분리.
import { adminApi } from "./api/admin";
// R6-D4: queue 도메인 분리.
import { queueApi } from "./api/queue";
// R6-D5: operations (scrap/loss/variance + alerts + counts) 도메인 분리.
import { operationsApi } from "./api/operations";
// R6-D6: catalog (models + ship-packages + BOM) 도메인 분리.
import { catalogApi } from "./api/catalog";
// R6-D7: production / transactions / exports 도메인 분리.
import { productionApi } from "./api/production";
// R6-D8: stock-requests 도메인 분리.
import { stockRequestsApi } from "./api/stock-requests";
// R6-D9: departments + app-session 도메인 분리 (마지막).
import { departmentsApi } from "./api/departments";
// weekly-report 도메인.
import { weeklyApi } from "./api/weekly";

// 외부 import 호환을 위해 동일 이름 그대로 re-export.
// parseError 는 도메인 API (직접 fetch 사용처) 가 본 파일 내부에서 사용 — 이번 PR 에선 그대로.
export {
  extractErrorMessage,
  fetcher,
  postJson,
  putJson,
  patchJson,
  FALLBACK_SERVER_API_BASE,
};

// R4-2: 모든 type / interface 정의는 lib/api/types.ts 로 분리.
// 외부 호환을 위해 본 파일이 동일 이름으로 re-export 한다.
import type {
  ProcessTypeCode,
  TransactionType,
  LocationStatus,
  InventoryLocationRow,
  Department,
  EmployeeLevel,
  WarehouseRole,
  ProcessTypeSummary,
  InventorySummary,
  ProductModel,
  DepartmentMaster,
  Item,
  QueueBatchType,
  QueueBatchStatus,
  QueueLineDirection,
  QueueLine,
  QueueBatch,
  AlertKind,
  StockAlert,
  PhysicalCount,
  ScrapLogRow,
  LossLogRow,
  VarianceLogRow,
  Employee,
  StockRequestStatus,
  StockRequestType,
  RequestBucket,
  StockRequestLine,
  StockRequest,
  StockRequestCreatePayload,
  StockRequestDraftUpsertPayload,
  StockRequestActionPayload,
  StockRequestReservationLine,
  ShipPackageItemDetail,
  ShipPackage,
  InventoryMutationResponse,
  BOMEntry,
  BOMDetailEntry,
  BOMTreeNode,
  TransactionLog,
  TransactionEditLog,
  ProductionCheckComponent,
  ProductionCheckResponse,
  ProductionCapacityItem,
  ProductionCapacity,
  BackflushDetail,
  ProductionReceiptResponse,
  WeeklyItemReport,
  WeeklyGroupReport,
  WeeklyWarning,
  WeeklyReportSummary,
  WeeklyReportResponse,
} from "./api/types";

export type {
  ProcessTypeCode,
  TransactionType,
  LocationStatus,
  InventoryLocationRow,
  Department,
  EmployeeLevel,
  WarehouseRole,
  ProcessTypeSummary,
  InventorySummary,
  ProductModel,
  DepartmentMaster,
  Item,
  QueueBatchType,
  QueueBatchStatus,
  QueueLineDirection,
  QueueLine,
  QueueBatch,
  AlertKind,
  StockAlert,
  PhysicalCount,
  ScrapLogRow,
  LossLogRow,
  VarianceLogRow,
  Employee,
  StockRequestStatus,
  StockRequestType,
  RequestBucket,
  StockRequestLine,
  StockRequest,
  StockRequestCreatePayload,
  StockRequestDraftUpsertPayload,
  StockRequestActionPayload,
  StockRequestReservationLine,
  ShipPackageItemDetail,
  ShipPackage,
  InventoryMutationResponse,
  BOMEntry,
  BOMDetailEntry,
  BOMTreeNode,
  TransactionLog,
  TransactionEditLog,
  ProductionCheckComponent,
  ProductionCheckResponse,
  ProductionCapacityItem,
  ProductionCapacity,
  BackflushDetail,
  ProductionReceiptResponse,
  WeeklyItemReport,
  WeeklyGroupReport,
  WeeklyWarning,
  WeeklyReportSummary,
  WeeklyReportResponse,
};

export const api = {
  // R5-5: items 도메인은 lib/api/items.ts 로 분리. 본 객체는 spread 로 흡수.
  ...itemsApi,
  // R6-D1: inventory 도메인 분리 (11 메소드).
  ...inventoryApi,
  // R6-D2: employees 도메인 분리 (6 메소드).
  ...employeesApi,
  // R6-D3: admin / settings 도메인 분리 (3 메소드).
  ...adminApi,
  // R6-D4: queue 도메인 분리 (9 메소드).
  ...queueApi,
  // R6-D5: operations 도메인 분리 (10 메소드 — scrap/loss/variance + alerts + counts).
  ...operationsApi,
  // R6-D6: catalog 도메인 분리 (16 메소드 — models + ship-packages + BOM).
  ...catalogApi,
  // R6-D7: production / transactions / exports 도메인 분리 (9 메소드).
  ...productionApi,
  // R6-D8: stock-requests 도메인 분리 (12 메소드 — 결재 흐름 + draft).
  ...stockRequestsApi,
  // R6-D9: departments + app-session 도메인 분리 (6 메소드).
  ...departmentsApi,
  // weekly-report 도메인.
  ...weeklyApi,
};
