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

export type DeptIoDirection = "in" | "out";

/** 대시보드 빠른작업 → 입출고 위저드 깊은 진입 인텐트.
 *  workType 선택 + direction(process 전용) 또는 subType(warehouse_io/receive 전용)을 담아
 *  위저드가 Step3(대상 선택)에 프리셋된 채로 열린다. */
export interface IoEntryIntent {
  workType: IoWorkType;
  direction?: DeptIoDirection;
  subType?: IoSubType;
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
  /** '이어서 하기' 클릭마다 증가하는 토큰. 같은 draft 를 다시 골라도(batch_id 불변)
   *  nonce 가 바뀌면 복원 effect 가 재발동한다. */
  restoreNonce?: number;
  defaultWorkType?: IoWorkType;
  entryIntent?: IoEntryIntent | null;
  onStatusChange: (status: string) => void;
  onSubmitSuccess?: () => void;
  onItemConversionFocusChange?: (focused: boolean) => void;
}
