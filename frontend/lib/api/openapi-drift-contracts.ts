/**
 * 아직 runtime adapter로 전환하지 않은 DTO seam의 의도적 raw/public 차이 계약.
 * OpenAPI 재생성 뒤 requiredness/nullability/open-enum이 바뀌면 app typecheck가 실패한다.
 */
import type { components, operations } from "./generated/openapi";
import type { AssemblyChecklistSection } from "./types/assembly-checklists";
import type { BOMTreeNode } from "./types/catalog";
import type { DefectLocation, QuarantinePayload } from "./types/defects";
import type { DepartmentMaster } from "./types/departments";
import type {
  AdjDirection,
  AdjLineTemplate,
  BomTemplateResponse,
  DeptAdjSubType,
} from "./types/dept-adjustment";
import type { Employee } from "./types/employees";
import type { Handover, HandoverLine, HandoverStatus } from "./types/handover";
import type {
  IoBatch,
  IoBundle,
  IoLine,
  IoPreviewResponse,
  IoSubType,
  IoWorkType,
} from "./types/io";
import type { Item } from "./types/items";
import type { AppNotification, NotificationType } from "./types/notifications";
import type { ProductionCapacity, TransactionLog } from "./types/production";
import type { Department, InventoryLocationRow } from "./types/shared";
import type { ShippingRequest } from "./types/shipping";
import type { StockRequestCommandType } from "./types/stock-requests";
import type { WeeklyWarning } from "./types/weekly";
import type { ReconcileRow, WarehouseAngle, WarehouseBoxItem } from "./warehouse-map";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;
type KeyIsOptional<Shape, Key extends keyof Shape> =
  object extends Pick<Shape, Key> ? true : false;
type OptionalKeys<Shape> = {
  [Key in keyof Shape]-?: KeyIsOptional<Shape, Key> extends true ? Key : never;
}[keyof Shape];

type Raw = components["schemas"];
type DepartmentsApi = typeof import("./departments")["departmentsApi"];
type ItemsApi = typeof import("./items")["itemsApi"];
type WarehouseMapApi = typeof import("./warehouse-map")["warehouseMapApi"];

// assembly-checklists: raw title 생략과 required public field의 전환 계약.
export type AssemblyChecklistTitleRawOptional = Assert<Equal<
  KeyIsOptional<Raw["AssemblyChecklistSectionResponse"], "title">,
  true
>>;
export type AssemblyChecklistTitlePublicRequired = Assert<Equal<
  KeyIsOptional<AssemblyChecklistSection, "title">,
  false
>>;
export type AssemblyChecklistRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["AssemblyChecklistSectionResponse"]>,
  "title"
>>;
export type AssemblyChecklistPublicOptionalKeys = Assert<Equal<
  OptionalKeys<AssemblyChecklistSection>,
  never
>>;
export type AssemblyChecklistTitleValue = Assert<Equal<
  Raw["AssemblyChecklistSectionResponse"]["title"],
  AssemblyChecklistSection["title"] | undefined
>>;

// defects: response optionality와 command의 open source string을 의도적으로 분리한다.
export type DefectReasonRawRequired = Assert<Equal<
  KeyIsOptional<Raw["DefectLocationItem"], "reason_category">,
  false
>>;
export type DefectReasonPublicOptional = Assert<Equal<
  KeyIsOptional<DefectLocation, "reason_category">,
  true
>>;
export type DefectQuarantineRawSourceOpen = Assert<Equal<
  Raw["QuarantineRequest"]["source"],
  string
>>;
export type DefectQuarantinePublicSourceClosed = Assert<Equal<
  QuarantinePayload["source"],
  "warehouse" | "production"
>>;
export type DefectLocationRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["DefectLocationItem"]>,
  "has_bom" | "is_legacy" | "legacy_origin" | "management_category" | "pending_quantity"
>>;
export type DefectLocationPublicOptionalKeys = Assert<Equal<
  OptionalKeys<DefectLocation>,
  "management_category" | "quarantined_by" | "quarantined_by_employee_id" | "reason_category" | "reason_memo"
>>;
export type DefectLegacyOriginRaw = Assert<Equal<
  Raw["DefectLocationItem"]["legacy_origin"],
  DefectLocation["legacy_origin"] | undefined
>>;
export type DefectQuarantineRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["QuarantineRequest"]>,
  "client_request_id" | "management_category" | "reason_category" | "source_dept"
>>;
export type DefectQuarantinePublicOptionalKeys = Assert<Equal<
  OptionalKeys<QuarantinePayload>,
  "client_request_id" | "management_category" | "reason_category" | "source_dept"
>>;

// departments: 생략과 명시 null을 같은 값으로 보지 않는 requiredness 계약.
export type DepartmentColorRawOptional = Assert<Equal<
  KeyIsOptional<Raw["DepartmentResponse"], "color_hex">,
  true
>>;
export type DepartmentColorPublicRequired = Assert<Equal<
  KeyIsOptional<DepartmentMaster, "color_hex">,
  false
>>;
export type DepartmentResponseRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["DepartmentResponse"]>,
  "color_hex" | "io_enabled"
>>;
export type DepartmentPublicOptionalKeys = Assert<Equal<
  OptionalKeys<DepartmentMaster>,
  "io_enabled"
>>;
export type DepartmentColorValue = Assert<Equal<
  Raw["DepartmentResponse"]["color_hex"],
  DepartmentMaster["color_hex"] | undefined
>>;
export type DepartmentCreateRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["DepartmentCreate"]>,
  "color_hex" | "display_order" | "io_enabled"
>>;
export type DepartmentCreateBoundary = Assert<Equal<
  Parameters<DepartmentsApi["createDepartment"]>[0],
  Raw["DepartmentCreate"]
>>;
export type DepartmentUpdateBoundary = Assert<Equal<
  Parameters<DepartmentsApi["updateDepartment"]>[1],
  Raw["DepartmentUpdate"]
>>;

// dept-adjustment: Decimal wire string과 업무 number, open enum과 command enum을 분리한다.
export type DeptAdjustmentQuantityRawString = Assert<Equal<
  Raw["AdjLineResponse"]["quantity"],
  string
>>;
export type DeptAdjustmentQuantityPublicNumber = Assert<Equal<
  AdjLineTemplate["quantity"],
  number
>>;
export type DeptAdjustmentBomExpectedRawString = Assert<Equal<
  Raw["AdjLineResponse"]["bom_expected"],
  string | null
>>;
export type DeptAdjustmentBomExpectedPublicNumber = Assert<Equal<
  AdjLineTemplate["bom_expected"],
  number | null
>>;
export type DeptAdjustmentDirectionRawOpen = Assert<Equal<
  Raw["AdjLineResponse"]["direction"],
  string
>>;
export type DeptAdjustmentDirectionPublicClosed = Assert<Equal<
  AdjLineTemplate["direction"],
  AdjDirection
>>;
export type DeptAdjustmentSubTypeRawOpen = Assert<Equal<
  Raw["BomTemplateResponse"]["sub_type"],
  string
>>;
export type DeptAdjustmentSubTypePublicClosed = Assert<Equal<
  BomTemplateResponse["sub_type"],
  DeptAdjSubType
>>;
export type DeptAdjustmentRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["AdjLineResponse"]>,
  never
>>;
export type DeptAdjustmentPublicOptionalKeys = Assert<Equal<
  OptionalKeys<AdjLineTemplate>,
  "bom_auto_token" | "bom_parent_item_id" | "bom_stock_exempt"
>>;
export type BomTemplateRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["BomTemplateResponse"]>,
  never
>>;
export type BomTemplatePublicOptionalKeys = Assert<Equal<
  OptionalKeys<BomTemplateResponse>,
  never
>>;

// employees: backend의 open role string과 화면 command role union을 분리한다.
export type EmployeeDepartmentRawOpen = Assert<Equal<
  Raw["EmployeeResponse"]["department"],
  string
>>;
export type EmployeeDepartmentPublicClosed = Assert<Equal<Employee["department"], Department>>;
export type EmployeeWarehouseRoleRawOpen = Assert<Equal<
  Raw["EmployeeResponse"]["warehouse_role"],
  string | undefined
>>;
export type EmployeeWarehouseRoleRawOptional = Assert<Equal<
  KeyIsOptional<Raw["EmployeeResponse"], "warehouse_role">,
  true
>>;
export type EmployeeWarehouseRolePublicClosed = Assert<Equal<
  Employee["warehouse_role"],
  "none" | "primary" | "deputy"
>>;
export type EmployeeWarehouseRolePublicRequired = Assert<Equal<
  KeyIsOptional<Employee, "warehouse_role">,
  false
>>;
export type EmployeeDepartmentRoleRawOpen = Assert<Equal<
  Raw["EmployeeResponse"]["department_role"],
  string | undefined
>>;
export type EmployeeDepartmentRoleRawOptional = Assert<Equal<
  KeyIsOptional<Raw["EmployeeResponse"], "department_role">,
  true
>>;
export type EmployeeDepartmentRolePublicClosed = Assert<Equal<
  Employee["department_role"],
  "none" | "primary" | "deputy"
>>;
export type EmployeeDepartmentRolePublicRequired = Assert<Equal<
  KeyIsOptional<Employee, "department_role">,
  false
>>;
export type EmployeeRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["EmployeeResponse"]>,
  | "assigned_model_slots"
  | "department_role"
  | "hidden_sidebar_tabs"
  | "io_enabled"
  | "login_notification_popup_enabled"
  | "pin_is_default"
  | "pin_last_changed"
  | "sidebar_mode"
  | "theme"
  | "warehouse_role"
>>;
export type EmployeePublicOptionalKeys = Assert<Equal<
  OptionalKeys<Employee>,
  | "assigned_model_slots"
  | "hidden_sidebar_tabs"
  | "io_enabled"
  | "login_notification_popup_enabled"
  | "pin_is_default"
  | "pin_last_changed"
  | "sidebar_mode"
  | "theme"
>>;
export type EmployeeLevelGenerated = Assert<Equal<
  Employee["level"],
  Raw["EmployeeResponse"]["level"]
>>;

// handover: open status와 생략 가능한 응답 필드는 public facade와 별도 계약이다.
export type HandoverStatusRawOpen = Assert<Equal<Raw["HandoverResponse"]["status"], string>>;
export type HandoverStatusPublicOpen = Assert<Equal<Handover["status"], HandoverStatus>>;
export type HandoverProcessContentRawOptional = Assert<Equal<
  KeyIsOptional<Raw["HandoverResponse"], "process_content">,
  true
>>;
export type HandoverProcessContentPublicRequired = Assert<Equal<
  KeyIsOptional<Handover, "process_content">,
  false
>>;
export type HandoverLineMesCodeRawOptional = Assert<Equal<
  KeyIsOptional<Raw["HandoverLineResponse"], "mes_code_snapshot">,
  true
>>;
export type HandoverLineMesCodePublicRequired = Assert<Equal<
  KeyIsOptional<HandoverLine, "mes_code_snapshot">,
  false
>>;
export type HandoverRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["HandoverResponse"]>,
  | "analysis_text"
  | "doc_date"
  | "handover_code"
  | "lines"
  | "notes"
  | "process_content"
  | "product_name"
  | "received_at"
  | "received_by_employee_id"
  | "received_by_name"
>>;
export type HandoverPublicOptionalKeys = Assert<Equal<OptionalKeys<Handover>, never>>;
export type HandoverLineRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["HandoverLineResponse"]>,
  "mes_code_snapshot"
>>;
export type HandoverLinePublicOptionalKeys = Assert<Equal<
  OptionalKeys<HandoverLine>,
  never
>>;
export type HandoverLineQuantity = Assert<Equal<
  Raw["HandoverLineResponse"]["quantity"],
  HandoverLine["quantity"]
>>;

// IO: raw 응답의 open work/sub type과 optional line/bundle 필드를 고정한다.
export type IoPreviewWorkTypeRawOpen = Assert<Equal<Raw["IoPreviewResponse"]["work_type"], string>>;
export type IoPreviewWorkTypePublicClosed = Assert<Equal<IoPreviewResponse["work_type"], IoWorkType>>;
export type IoPreviewSubTypeRawOpen = Assert<Equal<Raw["IoPreviewResponse"]["sub_type"], string>>;
export type IoPreviewSubTypePublicClosed = Assert<Equal<IoPreviewResponse["sub_type"], IoSubType>>;
export type IoBatchBundlesRawOptional = Assert<Equal<
  KeyIsOptional<Raw["IoBatchResponse"], "bundles">,
  true
>>;
export type IoBatchBundlesPublicRequired = Assert<Equal<
  KeyIsOptional<IoBatch, "bundles">,
  false
>>;
export type IoBundleLinesRawOptional = Assert<Equal<
  KeyIsOptional<Raw["IoBundlePayload"], "lines">,
  true
>>;
export type IoBundleLinesPublicRequired = Assert<Equal<
  KeyIsOptional<IoBundle, "lines">,
  false
>>;
export type IoLineMesCodeRawOptional = Assert<Equal<
  KeyIsOptional<Raw["IoLinePayload"], "mes_code">,
  true
>>;
export type IoLineMesCodePublicRequired = Assert<Equal<KeyIsOptional<IoLine, "mes_code">, false>>;
export type IoPreviewRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["IoPreviewResponse"]>,
  never
>>;
export type IoPreviewPublicOptionalKeys = Assert<Equal<OptionalKeys<IoPreviewResponse>, never>>;
export type IoBatchRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["IoBatchResponse"]>,
  | "approver_employee_id"
  | "approver_name"
  | "bundles"
  | "completed_at"
  | "department_routes_normalized"
  | "from_department"
  | "notes"
  | "reference_no"
  | "shipping_request_id"
  | "stock_request_id"
  | "stock_requests"
  | "submitted_at"
  | "to_department"
>>;
export type IoBatchPublicOptionalKeys = Assert<Equal<
  OptionalKeys<IoBatch>,
  "department_routes_normalized" | "shipping_request_id" | "stock_requests"
>>;
export type IoBundleRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["IoBundlePayload"]>,
  | "expanded_level"
  | "internal_use_bom_mode"
  | "lines"
  | "source_item_id"
  | "source_location"
  | "source_mes_code"
>>;
export type IoBundlePublicOptionalKeys = Assert<Equal<
  OptionalKeys<IoBundle>,
  "internal_use_bom_mode" | "source_location"
>>;
export type IoLineRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["IoLinePayload"]>,
  | "bom_auto_token"
  | "bom_expected"
  | "bom_stock_exempt"
  | "edited"
  | "exclusion_note"
  | "from_department"
  | "has_children"
  | "included"
  | "mes_code"
  | "selected"
  | "shortage"
  | "to_department"
  | "unit"
>>;
export type IoLinePublicOptionalKeys = Assert<Equal<
  OptionalKeys<IoLine>,
  "bom_auto_token" | "bom_stock_exempt" | "selected"
>>;

// items: nullable quantity와 create/update request requiredness를 명시한다.
export type ItemQuantityRawNullable = Assert<Equal<
  Raw["ItemWithInventory"]["quantity"],
  Item["quantity"] | null | undefined
>>;
export type ItemQuantityRawOptional = Assert<Equal<
  KeyIsOptional<Raw["ItemWithInventory"], "quantity">,
  true
>>;
export type ItemCreateInitialQuantityRequired = Assert<Equal<
  KeyIsOptional<Raw["ItemCreate"], "initial_quantity">,
  false
>>;
export type ItemCreateModelSlotsRequired = Assert<Equal<
  KeyIsOptional<Raw["ItemCreate"], "model_slots">,
  false
>>;
export type ItemUpdateMesCodeNullable = Assert<Equal<
  Raw["ItemUpdate"]["mes_code"],
  string | null | undefined
>>;
export type ItemCreateBoundaryInitialQuantityRequired = Assert<Equal<
  KeyIsOptional<Parameters<ItemsApi["createItem"]>[0], "initial_quantity">,
  false
>>;
export type ItemCreateBoundaryModelSlotsRequired = Assert<Equal<
  KeyIsOptional<Parameters<ItemsApi["createItem"]>[0], "model_slots">,
  false
>>;
export type ItemUpdateBoundaryMesCodeNullable = Assert<Equal<
  Parameters<ItemsApi["updateItem"]>[1]["mes_code"],
  Raw["ItemUpdate"]["mes_code"]
>>;
export type ItemRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["ItemWithInventory"]>,
  | "available_quantity"
  | "bom_completed_at"
  | "bom_stock_exempt"
  | "defective_total"
  | "deleted_at"
  | "department"
  | "department_pending_quantity"
  | "has_bom"
  | "last_reserver_name"
  | "legacy_item_type"
  | "legacy_part"
  | "location"
  | "locations"
  | "mes_code"
  | "min_stock"
  | "minimum_order_quantity"
  | "model_slots"
  | "model_symbol"
  | "pending_quantity"
  | "process_type_code"
  | "procurement_lead_time_days"
  | "production_total"
  | "purchase_memo"
  | "purchase_price_effective_date"
  | "quantity"
  | "reorder_point"
  | "sales_review_required"
  | "serial_no"
  | "standard_purchase_price"
  | "supplier"
  | "supplier_item_code"
  | "warehouse_available_quantity"
  | "warehouse_qty"
>>;
export type ItemPublicOptionalKeys = Assert<Equal<
  OptionalKeys<Item>,
  | "bom_stock_exempt"
  | "department_pending_quantity"
  | "has_bom"
  | "sales_review_required"
  | "warehouse_available_quantity"
>>;
export type ItemCreateBoundary = Assert<Equal<
  Parameters<ItemsApi["createItem"]>[0],
  Raw["ItemCreate"]
>>;
export type ItemUpdateBoundary = Assert<Equal<
  Parameters<ItemsApi["updateItem"]>[1],
  Raw["ItemUpdate"]
>>;

// notifications: backend의 open type을 public response에도 그대로 허용한다.
export type NotificationTypeRawOpen = Assert<Equal<Raw["NotificationResponse"]["type"], string>>;
export type NotificationTypePublicOpen = Assert<Equal<AppNotification["type"], NotificationType>>;

// production: optional capacity 필드와 free-form operation raw 경계를 고정한다.
export type ProductionTopItemsRawOptional = Assert<Equal<
  KeyIsOptional<Raw["CapacityResponse"], "top_items">,
  true
>>;
export type ProductionTopItemsPublicRequired = Assert<Equal<
  KeyIsOptional<ProductionCapacity, "top_items">,
  false
>>;
export type ProductionInventoryEffectRawOptional = Assert<Equal<
  KeyIsOptional<Raw["TransactionLogResponse"], "inventory_effect">,
  true
>>;
export type ProductionInventoryEffectPublicOptional = Assert<Equal<
  KeyIsOptional<TransactionLog, "inventory_effect">,
  true
>>;
export type ProductionInventoryEffectRawFreeForm = Assert<Equal<
  NonNullable<Raw["TransactionLogResponse"]["inventory_effect"]>[number],
  { [key: string]: unknown }
>>;
export type InventoryOperationListRawFreeForm = Assert<Equal<
  operations["list_operations_api_inventory_operations_get"]["responses"][200]["content"]["application/json"],
  { [key: string]: unknown }
>>;
export type InventoryOperationCancellationPreviewRawFreeForm = Assert<Equal<
  operations["preview_operation_cancel_api_inventory_operations__operation_id__cancel_preview_post"]["responses"][200]["content"]["application/json"],
  { [key: string]: unknown }
>>;
export type InventoryOperationCancellationResultRawFreeForm = Assert<Equal<
  operations["cancel_operation_api_inventory_operations__operation_id__cancel_post"]["responses"][200]["content"]["application/json"],
  { [key: string]: unknown }
>>;
export type ProductionCapacityRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["CapacityResponse"]>,
  "af" | "limiting_item" | "representative_items" | "status" | "top_items"
>>;
export type ProductionCapacityPublicOptionalKeys = Assert<Equal<
  OptionalKeys<ProductionCapacity>,
  "af" | "representative_items" | "status"
>>;

// shared inventory location: backend의 open department를 public response에도 허용한다.
export type InventoryLocationDepartmentRawOpen = Assert<Equal<
  Raw["InventoryLocationResponse"]["department"],
  string
>>;
export type InventoryLocationDepartmentPublicOpen = Assert<Equal<
  InventoryLocationRow["department"],
  string
>>;
export type InventoryLocationRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["InventoryLocationResponse"]>,
  "available_quantity" | "pending_quantity"
>>;
export type InventoryLocationPublicOptionalKeys = Assert<Equal<
  OptionalKeys<InventoryLocationRow>,
  "available_quantity" | "pending_quantity"
>>;

// shipping/stock/catalog은 이 change에서 실제 raw adapter로 전환한 핵심 seam이다.
export type ShippingFinalizationModeRawRequired = Assert<Equal<
  KeyIsOptional<Raw["ShippingRequestResponse"], "finalization_mode">,
  false
>>;
export type ShippingFinalizationModePublicRequired = Assert<Equal<
  KeyIsOptional<ShippingRequest, "finalization_mode">,
  false
>>;
export type ShippingFinalizationModeGenerated = Assert<Equal<
  Raw["ShippingFinalizationModeEnum"],
  ShippingRequest["finalization_mode"]
>>;
export type StockRequestCommandGenerated = Assert<Equal<
  Raw["StockRequestCreate"]["request_type"],
  StockRequestCommandType
>>;
export type CatalogMesCodeRawOptional = Assert<Equal<
  KeyIsOptional<Raw["BOMTreeNode"], "mes_code">,
  true
>>;
export type CatalogMesCodePublicRequired = Assert<Equal<KeyIsOptional<BOMTreeNode, "mes_code">, false>>;
export type CatalogCurrentStockRawOptional = Assert<Equal<
  KeyIsOptional<Raw["BOMTreeNode"], "current_stock">,
  true
>>;
export type CatalogCurrentStockPublicRequired = Assert<Equal<
  KeyIsOptional<BOMTreeNode, "current_stock">,
  false
>>;
export type CatalogMesCodeValue = Assert<Equal<
  Raw["BOMTreeNode"]["mes_code"],
  BOMTreeNode["mes_code"] | undefined
>>;
export type CatalogCurrentStockValue = Assert<Equal<
  Raw["BOMTreeNode"]["current_stock"],
  BOMTreeNode["current_stock"] | undefined
>>;
export type ShippingRequestRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["ShippingRequestResponse"]>,
  | "allocations"
  | "base_pf_mes_code"
  | "bom_lines"
  | "cancelled_at"
  | "cancelled_by_employee_id"
  | "cancelled_by_name"
  | "checklist_lines"
  | "companion_lines"
  | "custom_pa_name"
  | "custom_pf_name"
  | "events"
  | "final_pa_item_id"
  | "final_pa_item_name"
  | "final_pf_item_id"
  | "final_pf_item_name"
  | "invoice_number"
  | "latest_preparation_revision"
  | "notes"
  | "picked_up_at"
  | "prepared_at"
  | "prepared_by_employee_id"
  | "prepared_by_name"
  | "request_quantity"
  | "requested_by_name"
  | "reuse_pf_item_id"
  | "serial_numbers"
  | "stock_shortages"
  | "transaction_count"
  | "transactions"
>>;
export type ShippingRequestPublicOptionalKeys = Assert<Equal<
  OptionalKeys<ShippingRequest>,
  | "cancelled_at"
  | "cancelled_by_employee_id"
  | "cancelled_by_name"
  | "invoice_number"
  | "latest_preparation_revision"
  | "prepared_by_employee_id"
  | "prepared_by_name"
  | "reuse_pf_item_id"
>>;
export type CatalogRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["BOMTreeNode"]>,
  | "additional_producible_quantity"
  | "children"
  | "current_stock"
  | "mes_code"
  | "process_type_code"
  | "production_capacity_ignored"
>>;
export type CatalogPublicOptionalKeys = Assert<Equal<
  OptionalKeys<BOMTreeNode>,
  "additional_producible_quantity" | "production_capacity_ignored"
>>;

// weekly UI는 frozen이므로 API/DTO 경계의 open level 계약만 typecheck에 연결한다.
export type WeeklyWarningLevelRawOpen = Assert<Equal<Raw["WeeklyWarning"]["level"], string>>;
export type WeeklyWarningLevelPublicOpen = Assert<Equal<
  WeeklyWarning["level"],
  string
>>;
export type WeeklyWarningRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["WeeklyWarning"]>,
  never
>>;
export type WeeklyWarningPublicOptionalKeys = Assert<Equal<
  OptionalKeys<WeeklyWarning>,
  never
>>;

// warehouse-map: request parameter와 raw/public response optionality를 각각 실제 API에 연결한다.
export type WarehouseAngleCreateRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["WarehouseAngleCreate"]>,
  | "angle_type"
  | "display_order"
  | "height"
  | "jaris_per_cell"
  | "layers"
  | "pos_x"
  | "pos_y"
  | "rows"
  | "width"
>>;
export type WarehouseAngleCreateBoundary = Assert<Equal<
  Parameters<WarehouseMapApi["createAngle"]>[0],
  Raw["WarehouseAngleCreate"]
>>;
export type WarehouseAngleUpdateBoundary = Assert<Equal<
  Parameters<WarehouseMapApi["updateAngle"]>[1],
  Raw["WarehouseAngleUpdate"]
>>;
export type WarehouseAngleResponseRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["WarehouseAngleResponse"]>,
  "angle_type"
>>;
export type WarehouseAnglePublicOptionalKeys = Assert<Equal<
  OptionalKeys<WarehouseAngle>,
  never
>>;
export type WarehouseAngleResponseBoundary = Assert<Equal<
  Awaited<ReturnType<WarehouseMapApi["getStructure"]>>[number],
  WarehouseAngle
>>;
export type WarehouseBoxCreateRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["WarehouseBoxCreate"]>,
  "items"
>>;
export type WarehouseBoxCreateBoundary = Assert<Equal<
  Parameters<WarehouseMapApi["createBox"]>[0],
  Raw["WarehouseBoxCreate"]
>>;
export type WarehouseBoxUpdateBoundary = Assert<Equal<
  Parameters<WarehouseMapApi["updateBox"]>[1],
  Raw["WarehouseBoxUpdate"]
>>;
export type WarehouseBoxItemRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["WarehouseBoxItemResponse"]>,
  "color_hex" | "department" | "mes_code"
>>;
export type WarehouseBoxItemPublicOptionalKeys = Assert<Equal<
  OptionalKeys<WarehouseBoxItem>,
  never
>>;
export type ReconcileRawOptionalKeys = Assert<Equal<
  OptionalKeys<Raw["ReconcileRow"]>,
  "mes_code"
>>;
export type ReconcilePublicOptionalKeys = Assert<Equal<OptionalKeys<ReconcileRow>, never>>;
