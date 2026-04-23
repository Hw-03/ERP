"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import { INITIAL_IO_WIZARD_STATE, type IOWizardAction, type IOWizardState } from "../ioWizardTypes";
import { ioWizardReducer } from "../ioWizardReducer";

type Ctx = {
  state: IOWizardState;
  dispatch: React.Dispatch<IOWizardAction>;
};

const WarehouseWizardContext = createContext<Ctx | null>(null);

export function WarehouseWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(ioWizardReducer, INITIAL_IO_WIZARD_STATE);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <WarehouseWizardContext.Provider value={value}>{children}</WarehouseWizardContext.Provider>;
}

export function useWarehouseWizard() {
  const ctx = useContext(WarehouseWizardContext);
  if (!ctx) throw new Error("useWarehouseWizard must be used within WarehouseWizardProvider");
  return ctx;
}
