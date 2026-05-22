import type {
  Employee,
  IoBatch,
  IoBundle,
  IoLine,
  IoSubType,
  IoWorkType,
  Item,
  ProductModel,
} from "@/lib/api";

export type { IoBundle, IoLine, IoSubType, IoWorkType, Item, ProductModel };

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
  productModels?: ProductModel[];
  setItems: (items: Item[]) => void;
  preselectedItem?: Item | null;
  restoreDraft?: IoBatch | null;
  defaultWorkType?: IoWorkType;
  onStatusChange: (status: string) => void;
  onSubmitSuccess?: () => void;
  /** 대시보드 빨간 [불량 N] 클릭 시 URL ?defect_dept=X 로 전달된 부서명.
   * 있으면 마운트 시 자동으로 워크타입 "defect" 선택 + 해당 부서 필터 적용. */
  defectDeptFilter?: string | null;
  /** 현재 로그인된 직원 (불량 처리 허브에 전달). */
  currentEmployee?: OperatorLike | null;
}
