import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Department, Item, ProductModel, ShipPackage } from "@/lib/api";
import type {
  DefectiveSource,
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

/**
 * Round-13 (#17) 추출 — WarehouseStepLayout 의 props/state 타입 정의 묶음.
 */

export type StepState = "active" | "complete" | "locked";

export type WizardLike = {
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
  changeRawDir: (d: Direction) => void;
  changeWarehouseDir: (d: TransferDirection) => void;
  changeDeptDir: (d: Direction) => void;
  changeSelectedDept: (d: Department) => void;
  changeDefectiveSource: (s: DefectiveSource) => void;
  confirmStep2: () => void;
  step2Ready: boolean;
  step1State: StepState;
  step2State: StepState;
  hasItems: boolean;
  showStep3: boolean;
  showStep4: boolean;
  showStep5: boolean;
};

export type FilterLike = {
  localSearch: string;
  setLocalSearch: Dispatch<SetStateAction<string>>;
  dept: string;
  setDept: Dispatch<SetStateAction<string>>;
  modelFilter: string;
  setModelFilter: Dispatch<SetStateAction<string>>;
  stageFilter: string;
  setStageFilter: Dispatch<SetStateAction<string>>;
  displayLimit: number;
  setDisplayLimit: Dispatch<SetStateAction<number>>;
  filteredItems: Item[];
  filteredPackages: ShipPackage[];
  hiddenSelectedCount: number;
  hasActiveFilter: boolean;
  clearFilters: () => void;
};

export type WarehouseStepLayoutProps = {
  wizard: WizardLike;
  filter: FilterLike;
  availableWorkTypes: WorkType[];
  refs: {
    step2Ref: RefObject<HTMLDivElement>;
    step3Ref: RefObject<HTMLDivElement>;
    step4Ref: RefObject<HTMLDivElement>;
  };

  step2Summary: string;
  step2Accent: string;
  onChangeWorkType: (wt: WorkType) => void;
  onEditStep2: () => void;

  itemsSummary: string;
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  onToggleItem: (itemId: string) => void;
  onSelectPackage: (pkg: ShipPackage | null) => void;
  productModels: ProductModel[];
  pendingScrollId: string | null;
  onScrolled: () => void;

  accent: string;
  selectedEntries: { item: Item; quantity: number }[];
  isOutbound: boolean;
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearPackage: () => void;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  totalQty: number;

  shortLabel: string;
  canExecute: boolean;
  isCaution: boolean;
  blockerText: string | null;
  submitting: boolean;
  onSubmit: () => void;
};

export function AnimatedReveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: show ? "1fr" : "0fr",
        transition: "grid-template-rows 320ms ease",
      }}
    >
      <div style={{ overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
