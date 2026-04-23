"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import { INITIAL_IO_WIZARD_STATE, type IOWizardAction, type IOWizardState } from "../ioWizardTypes";
import { ioWizardReducer } from "../ioWizardReducer";

type Ctx = {
  state: IOWizardState;
  dispatch: React.Dispatch<IOWizardAction>;
};

const DeptWizardContext = createContext<Ctx | null>(null);

export function DeptWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(ioWizardReducer, INITIAL_IO_WIZARD_STATE);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <DeptWizardContext.Provider value={value}>{children}</DeptWizardContext.Provider>;
}

export function useDeptWizard() {
  const ctx = useContext(DeptWizardContext);
  if (!ctx) throw new Error("useDeptWizard must be used within DeptWizardProvider");
  return ctx;
}
