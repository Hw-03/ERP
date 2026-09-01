"""MES data models for the DEXCOWIN manufacturing workflow.

W9-B: 단일 `models.py` (705줄) → 도메인별 패키지로 분리. 모든 모델·Enum 을 본
모듈에서 re-export 하여 `from app.models import X` 호출 사이트를 그대로 보존한다.
"""

from app.models.audit import AdminAuditLog
from app.models.activity_audit import ActivityAuditLog, AuditTerminal
from app.models.base import (
    Base,
    BoolAsString,
    DepartmentEnum,
    DeptAdjSubTypeEnum,
)
from app.models.code import (
    ProcessType,
    ProductSymbol,
)
from app.models.employee import (
    Department,
    Employee,
    EmployeeAssignedModel,
    EmployeeLevelEnum,
)
from app.models.inventory import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
)
from app.models.handover import (
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
)
from app.models.io_batch import (
    IoBatch,
    IoBundle,
    IoLine,
)
from app.models.notification import (
    Notification,
    NotificationTypeEnum,
)
from app.models.operator_session import OperatorSession
from app.models.item import (
    BOM,
    Item,
)
from app.models.shipping import (
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestRevision,
    ShippingFinalizationModeEnum,
    ShippingRequestStatusEnum,
)
from app.models.stock_request import (
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.models.system import DataRevision, SystemSetting
from app.models.inventory_operation import (
    DefectInventoryMovement,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
)
from app.models.transaction import (
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.models.warehouse import (
    BoxSizeEnum,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseSpecialZoneAudit,
    WarehouseUnplacedItem,
)
from app.models.employee_item_order import EmployeeItemOrder
from app.models.assembly_checklist import (
    AssemblyChecklist,
    AssemblyChecklistItem,
    AssemblyChecklistSection,
)
from app.models.daily_work_report import DailyWorkReport
from app.models.weekly_inventory_snapshot import (
    WeeklyInventorySnapshot,
    WeeklyInventorySnapshotItem,
)
from app.models.defect import (
    DefectQuarantineMemoRevision,
    DefectQuarantineRecord,
    DefectQuarantineReconstruction,
    DefectQuarantineReconstructionAllocation,
)

__all__ = [
    # Base / 공통
    "Base",
    "BoolAsString",
    "DepartmentEnum",
    "DeptAdjSubTypeEnum",
    # employee
    "Department",
    "Employee",
    "EmployeeAssignedModel",
    "EmployeeLevelEnum",
    # item / BOM
    "Item",
    "BOM",
    # code masters
    "ProductSymbol",
    "ProcessType",
    # inventory
    "Inventory",
    "InventoryLocation",
    "LocationStatusEnum",
    # transaction
    "TransactionLog",
    "TransactionEditLog",
    "TransactionTypeEnum",
    "InventoryOperation",
    "InventoryOperationEffect",
    "DefectInventoryMovement",
    "InventoryOperationKindEnum",
    "InventoryOperationStatusEnum",
    "InventoryOperationEffectKindEnum",
    "InventoryOperationRoleEnum",
    # shipping
    "ShippingAllocation",
    "ShippingRequest",
    "ShippingRequestBomLine",
    "ShippingRequestChecklistLine",
    "ShippingRequestCompanionLine",
    "ShippingRequestEvent",
    "ShippingRequestRevision",
    "ShippingFinalizationModeEnum",
    "ShippingRequestStatusEnum",
    # stock requests
    "StockRequest",
    "StockRequestLine",
    "StockRequestStatusEnum",
    "StockRequestTypeEnum",
    "RequestBucketEnum",
    # handover
    "HandoverDoc",
    "HandoverLine",
    "HandoverStatusEnum",
    # io batches
    "IoBatch",
    "IoBundle",
    "IoLine",
    # notifications
    "Notification",
    "NotificationTypeEnum",
    "OperatorSession",
    # system / audit
    "SystemSetting",
    "DataRevision",
    "AdminAuditLog",
    "ActivityAuditLog",
    "AuditTerminal",
    # warehouse map
    "WarehouseAngle",
    "WarehouseBox",
    "WarehouseBoxItem",
    "WarehouseSpecialZone",
    "WarehouseSpecialZoneItem",
    "WarehouseSpecialZoneAudit",
    "WarehouseUnplacedItem",
    "BoxSizeEnum",
    # employee item order
    "EmployeeItemOrder",
    # assembly checklists
    "AssemblyChecklist",
    "AssemblyChecklistSection",
    "AssemblyChecklistItem",
    # daily work reports
    "DailyWorkReport",
    "WeeklyInventorySnapshot",
    "WeeklyInventorySnapshotItem",
    # defect quarantine records
    "DefectQuarantineRecord",
    "DefectQuarantineMemoRevision",
    "DefectQuarantineReconstruction",
    "DefectQuarantineReconstructionAllocation",
]
