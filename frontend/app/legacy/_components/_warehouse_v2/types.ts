import type {
  Employee,
  IoBatch,
  IoBundle,
  IoLine,
  IoSubType,
  IoWorkType,
  Item,
  ShipPackage,
} from "@/lib/api";

export type { IoBundle, IoLine, IoSubType, IoWorkType, Item, ShipPackage };

export interface OperatorLike {
  employee_id: string;
  name: string;
  department: string;
  warehouse_role?: string;
  level?: string;
}

export interface IoComposeViewProps {
  globalSearch: string;
  operator: OperatorLike | null;
  employees: Employee[];
  items: Item[];
  packages: ShipPackage[];
  setItems: (items: Item[]) => void;
  preselectedItem?: Item | null;
  restoreDraft?: IoBatch | null;
  onStatusChange: (status: string) => void;
  onSubmitSuccess?: () => void;
}
