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
// dept-adjustment 도메인.
import { deptAdjustmentApi } from "./api/dept-adjustment";
// 입출고 2.0 도메인.
import { ioApi } from "./api/io";
// 결재 알림 도메인.
import { notificationsApi } from "./api/notifications";
// 인수인계서 도메인.
import { handoverApi } from "./api/handover";
import { shippingApi } from "./api/shipping";
import { assemblyChecklistsApi } from "./api/assembly-checklists";

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
  DepartmentRole,
  ProcessTypeSummary,
  InventorySummary,
  ProductModel,
  DepartmentMaster,
  Item,
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
  BOMEntry,
  BOMDetailEntry,
  BOMTreeNode,
  TransactionLog,
  TransactionEditLog,
  ProductionCheckComponent,
  ProductionCheckResponse,
  ProductionCapacityItem,
  ProductionCapacity,
  ProductionCapacityStatus,
  BackflushDetail,
  ProductionReceiptResponse,
  WeeklyItemReport,
  WeeklyGroupReport,
  WeeklyWarning,
  WeeklyReportSummary,
  WeeklyReportResponse,
  IoWorkType,
  IoSubType,
  IoSourceKind,
  IoLineOrigin,
  IoLineDirection,
  IoBucket,
  IoLine,
  IoBundle,
  IoPreviewTarget,
  IoPreviewPayload,
  IoPreviewResponse,
  IoDraftPayload,
  IoBatch,
  IoSubmitResponse,
  ItemConversionMode,
  ItemConversionLine,
  ItemConversionPreview,
  ItemConversionPayload,
  ItemConversionResult,
  ShippingRequestStatus,
  ShippingBomParentStage,
  ShippingBomLineInput,
  ShippingCompanionLineInput,
  ShippingRequestCreatePayload,
  ShippingRequestUpdatePayload,
  ShippingChecklistUpdatePayload,
  ShippingComponentChangeExecutePayload,
  ShippingComponentChangeLine,
  ShippingComponentChangePreview,
  ShippingComponentChangeResult,
  ShippingPrepareCompletePayload,
  ShippingPrepareCancelPayload,
  ShippingBomLine,
  ShippingCompanionLine,
  ShippingChecklistLine,
  ShippingEvent,
  ShippingRequest,
  ShippingBomMatchResponse,
  AssemblyChecklist,
  AssemblyChecklistSection,
  AssemblyChecklistItem,
} from "./api/types";

export type {
  ProcessTypeCode,
  TransactionType,
  LocationStatus,
  InventoryLocationRow,
  Department,
  EmployeeLevel,
  WarehouseRole,
  DepartmentRole,
  ProcessTypeSummary,
  InventorySummary,
  ProductModel,
  DepartmentMaster,
  Item,
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
  BOMEntry,
  BOMDetailEntry,
  BOMTreeNode,
  TransactionLog,
  TransactionEditLog,
  ProductionCheckComponent,
  ProductionCheckResponse,
  ProductionCapacityItem,
  ProductionCapacity,
  ProductionCapacityStatus,
  BackflushDetail,
  ProductionReceiptResponse,
  WeeklyItemReport,
  WeeklyGroupReport,
  WeeklyWarning,
  WeeklyReportSummary,
  WeeklyReportResponse,
  IoWorkType,
  IoSubType,
  IoSourceKind,
  IoLineOrigin,
  IoLineDirection,
  IoBucket,
  IoLine,
  IoBundle,
  IoPreviewTarget,
  IoPreviewPayload,
  IoPreviewResponse,
  IoDraftPayload,
  IoBatch,
  IoSubmitResponse,
  ItemConversionMode,
  ItemConversionLine,
  ItemConversionPreview,
  ItemConversionPayload,
  ItemConversionResult,
  ShippingRequestStatus,
  ShippingBomParentStage,
  ShippingBomLineInput,
  ShippingCompanionLineInput,
  ShippingRequestCreatePayload,
  ShippingRequestUpdatePayload,
  ShippingChecklistUpdatePayload,
  ShippingComponentChangeExecutePayload,
  ShippingComponentChangeLine,
  ShippingComponentChangePreview,
  ShippingComponentChangeResult,
  ShippingPrepareCompletePayload,
  ShippingPrepareCancelPayload,
  ShippingBomLine,
  ShippingCompanionLine,
  ShippingChecklistLine,
  ShippingEvent,
  ShippingRequest,
  ShippingBomMatchResponse,
  AssemblyChecklist,
  AssemblyChecklistSection,
  AssemblyChecklistItem,
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
  // dept-adjustment 도메인 (부서 재고 조정).
  ...deptAdjustmentApi,
  // 입출고 2.0.
  ...ioApi,
  // 결재 알림.
  ...notificationsApi,
  // 인수인계서.
  ...handoverApi,
  ...shippingApi,
  ...assemblyChecklistsApi,
};
