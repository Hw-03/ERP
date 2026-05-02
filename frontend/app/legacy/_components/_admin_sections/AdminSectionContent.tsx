"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BOMDetailEntry, DepartmentMaster, Employee, Item, ProductModel, ShipPackage } from "@/lib/api";
import { api } from "@/lib/api";
import { AdminMasterItemsSection } from "./AdminMasterItemsSection";
import { AdminEmployeesSection } from "./AdminEmployeesSection";
import { AdminBomSection } from "./AdminBomSection";
import { AdminBomProvider } from "./AdminBomContext";
import { AdminPackagesProvider } from "./AdminPackagesContext";
import { AdminMasterItemsProvider } from "./AdminMasterItemsContext";
import { AdminEmployeesProvider } from "./AdminEmployeesContext";
import { AdminModelsProvider } from "./AdminModelsContext";
import { AdminPackagesSection } from "./AdminPackagesSection";
import { AdminModelsSection } from "./AdminModelsSection";
import { AdminExportSection } from "./AdminExportSection";
import { AdminDangerZone } from "./AdminDangerZone";
import { AdminDepartmentsProvider } from "./AdminDepartmentsContext";
import { AdminDepartmentsSection } from "./AdminDepartmentsSection";

/**
 * Round-11A (#4) 추출 — DesktopAdminView 의 section 별 콘텐츠 분기.
 *
 * 8 section (items / employees / bom / packages / models / departments / export / settings)
 * 의 Provider + Section 매핑을 부모 파일에서 분리해 본 컴포넌트로 흡수.
 */
type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

export interface AdminSectionContentProps {
  section: string;
  globalSearch: string;
  onStatusChange: (status: string) => void;
  setMessage: (m: string) => void;
  showSave: (text: string) => void;

  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  employees: Employee[];
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
  packages: ShipPackage[];
  setPackages: Dispatch<SetStateAction<ShipPackage[]>>;
  productModels: ProductModel[];
  setProductModels: Dispatch<SetStateAction<ProductModel[]>>;
  departments: DepartmentMaster[];
  setDepartments: Dispatch<SetStateAction<DepartmentMaster[]>>;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: Dispatch<SetStateAction<DepartmentMaster | null>>;
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;

  pinForm: PinForm;
  setPinForm: Dispatch<SetStateAction<PinForm>>;
  resetPin: string;
  setResetPin: Dispatch<SetStateAction<string>>;
  changePin: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  adminPin: string;
}

export function AdminSectionContent(props: AdminSectionContentProps) {
  const {
    section, globalSearch, onStatusChange, setMessage, showSave,
    items, setItems,
    employees, setEmployees,
    packages, setPackages,
    productModels, setProductModels,
    departments, setDepartments,
    selectedDept, setSelectedDept,
    allBomRows, refreshAllBom,
    pinForm, setPinForm, resetPin, setResetPin,
    changePin, resetDatabase, adminPin,
  } = props;

  if (section === "items") {
    return (
      <AdminMasterItemsProvider
        items={items}
        setItems={setItems}
        globalSearch={globalSearch}
        onStatusChange={onStatusChange}
        onError={setMessage}
        onShowSave={showSave}
      >
        <AdminMasterItemsSection />
      </AdminMasterItemsProvider>
    );
  }
  if (section === "employees") {
    return (
      <AdminEmployeesProvider
        employees={employees}
        setEmployees={setEmployees}
        departments={departments}
        onStatusChange={onStatusChange}
        onError={setMessage}
      >
        <AdminEmployeesSection />
      </AdminEmployeesProvider>
    );
  }
  if (section === "bom") {
    return (
      <AdminBomProvider
        items={items}
        allBomRows={allBomRows}
        refreshAllBom={refreshAllBom}
        onStatusChange={onStatusChange}
        onError={setMessage}
      >
        <AdminBomSection />
      </AdminBomProvider>
    );
  }
  if (section === "packages") {
    return (
      <AdminPackagesProvider
        items={items}
        packages={packages}
        setPackages={setPackages}
        onStatusChange={onStatusChange}
        onError={setMessage}
      >
        <AdminPackagesSection />
      </AdminPackagesProvider>
    );
  }
  if (section === "models") {
    return (
      <AdminModelsProvider
        productModels={productModels}
        setProductModels={setProductModels}
        onStatusChange={onStatusChange}
        onError={setMessage}
      >
        <AdminModelsSection />
      </AdminModelsProvider>
    );
  }
  if (section === "departments") {
    return (
      <AdminDepartmentsProvider
        departments={departments}
        setDepartments={setDepartments}
        selectedDept={selectedDept}
        setSelectedDept={setSelectedDept}
        onStatusChange={onStatusChange}
        onError={setMessage}
        adminPin={adminPin}
      >
        <AdminDepartmentsSection />
      </AdminDepartmentsProvider>
    );
  }
  if (section === "export") {
    return (
      <AdminExportSection
        itemsExportUrl={api.getItemsExportUrl()}
        transactionsExportUrl={api.getTransactionsExportUrl()}
      />
    );
  }
  if (section === "settings") {
    return (
      <AdminDangerZone
        pinForm={pinForm}
        setPinForm={setPinForm}
        resetPin={resetPin}
        setResetPin={setResetPin}
        onChangePin={() => void changePin()}
        onResetDatabase={() => void resetDatabase()}
      />
    );
  }
  return null;
}
