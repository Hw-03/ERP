"use client";

// Shared types for IO wizards. Shape is designed to be 1:1 portable to a
// zustand store: state = fields of IOWizardState, actions = IOWizardAction
// union members. Reducer is a pure function.

export type IOWizardState = {
  step: number;
  mode: string | null;
  employeeId: string | null;
  department: string | null;
  direction: "in" | "out" | null;
  usePackage: boolean;
  packageId: string | null;
  items: Map<string, number>;
  note: string;
  referenceNo: string;
  submitting: boolean;
  error: string | null;
};

export type IOWizardAction =
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "GO"; step: number }
  | { type: "SET_MODE"; mode: string | null }
  | { type: "SET_EMPLOYEE"; employeeId: string | null }
  | { type: "SET_DEPARTMENT"; department: string | null }
  | { type: "SET_DIRECTION"; direction: "in" | "out" | null }
  | { type: "SET_USE_PACKAGE"; value: boolean }
  | { type: "SET_PACKAGE"; packageId: string | null }
  | { type: "ADD_ITEM"; itemId: string; qty: number }
  | { type: "SET_QTY"; itemId: string; qty: number }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "CLEAR_ITEMS" }
  | { type: "PREFILL_ITEMS"; itemIds: string[]; qty?: number }
  | { type: "SET_NOTE"; note: string }
  | { type: "SET_REFERENCE"; referenceNo: string }
  | { type: "SET_SUBMITTING"; value: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET" };

export const INITIAL_IO_WIZARD_STATE: IOWizardState = {
  step: 0,
  mode: null,
  employeeId: null,
  department: null,
  direction: null,
  usePackage: false,
  packageId: null,
  items: new Map(),
  note: "",
  referenceNo: "",
  submitting: false,
  error: null,
};
