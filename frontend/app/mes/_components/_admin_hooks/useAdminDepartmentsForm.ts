"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DepartmentMaster } from "@/lib/api";
import { useUpdateDepartmentMutation } from "@/lib/queries/useDepartmentsQuery";
import { deptColor } from "../_admin_sections/_department_parts/departmentColors";

export type DepartmentForm = {
  addName: string;
};

export type DepartmentDetailForm = {
  name: string;
  color_hex: string;
};

export type SaveResult =
  | { status: "saved"; department: DepartmentMaster }
  | { status: "unchanged"; department: DepartmentMaster | null };

export type UseAdminDepartmentsFormArgs = {
  department: DepartmentMaster | null;
  adminPin: string;
  onStatusChange: (message: string) => void;
  onError: (message: string) => void;
  onSaved?: (department: DepartmentMaster) => void;
};

export type UseAdminDepartmentsFormState = {
  form: DepartmentForm;
  setAddName: (value: string) => void;
  detailForm: DepartmentDetailForm;
  setDetailForm: Dispatch<SetStateAction<DepartmentDetailForm>>;
  dirty: boolean;
  save: () => Promise<SaveResult>;
  reset: () => void;
};

const EMPTY_DETAIL_FORM: DepartmentDetailForm = { name: "", color_hex: "#5c5c5c" };

function toDetailForm(department: DepartmentMaster | null): DepartmentDetailForm {
  if (!department) return EMPTY_DETAIL_FORM;
  return {
    name: department.name,
    color_hex: deptColor(department),
  };
}

function formsEqual(left: DepartmentDetailForm, right: DepartmentDetailForm): boolean {
  return left.name === right.name
    && left.color_hex.toLowerCase() === right.color_hex.toLowerCase();
}

export function useAdminDepartmentsForm({
  department,
  adminPin,
  onStatusChange,
  onError,
  onSaved,
}: UseAdminDepartmentsFormArgs): UseAdminDepartmentsFormState {
  const [addName, setAddName] = useState("");
  const [detailForm, setDetailFormState] = useState<DepartmentDetailForm>(() => toDetailForm(department));
  const [baseline, setBaseline] = useState<DepartmentDetailForm>(() => toDetailForm(department));
  const { mutateAsync } = useUpdateDepartmentMutation();
  const inFlightRef = useRef<Promise<SaveResult> | null>(null);
  const departmentRef = useRef(department);
  const detailFormRef = useRef(detailForm);
  const baselineRef = useRef(baseline);
  const sourceDepartmentIdRef = useRef<number | null>(department?.id ?? null);
  const dirty = !formsEqual(detailForm, baseline);
  const dirtyRef = useRef(dirty);
  const setDetailForm = useCallback<Dispatch<SetStateAction<DepartmentDetailForm>>>((value) => {
    const next = typeof value === "function"
      ? value(detailFormRef.current)
      : value;
    detailFormRef.current = next;
    setDetailFormState(next);
  }, []);

  departmentRef.current = department;
  detailFormRef.current = detailForm;
  baselineRef.current = baseline;
  dirtyRef.current = dirty;

  useEffect(() => {
    const next = toDetailForm(department);
    const nextId = department?.id ?? null;
    const changedDepartment = sourceDepartmentIdRef.current !== nextId;
    sourceDepartmentIdRef.current = nextId;

    if (!changedDepartment && (dirtyRef.current || inFlightRef.current)) return;
    baselineRef.current = next;
    detailFormRef.current = next;
    setBaseline(next);
    setDetailForm(next);
  }, [department, setDetailForm]);

  const save = useCallback((): Promise<SaveResult> => {
    if (inFlightRef.current) return inFlightRef.current;

    const selected = departmentRef.current;
    const submitted = detailFormRef.current;
    if (!selected || formsEqual(submitted, baselineRef.current)) {
      return Promise.resolve({ status: "unchanged", department: selected });
    }

    let request!: Promise<SaveResult>;
    request = mutateAsync({
      id: selected.id,
      payload: {
        name: submitted.name.trim() || selected.name,
        color_hex: submitted.color_hex,
        pin: adminPin,
      },
    })
      .then((updated) => {
        const savedBaseline = toDetailForm(updated);
        baselineRef.current = savedBaseline;
        const nextDetailForm = formsEqual(detailFormRef.current, submitted)
          ? savedBaseline
          : detailFormRef.current;
        detailFormRef.current = nextDetailForm;
        setBaseline(savedBaseline);
        setDetailForm(nextDetailForm);
        onSaved?.(updated);
        onStatusChange(`'${updated.name}' 부서 정보를 저장했습니다.`);
        return { status: "saved" as const, department: updated };
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "저장 실패");
        throw error;
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, [adminPin, mutateAsync, onError, onSaved, onStatusChange, setDetailForm]);

  const reset = useCallback(() => {
    const next = toDetailForm(departmentRef.current);
    setAddName("");
    baselineRef.current = next;
    detailFormRef.current = next;
    setBaseline(next);
    setDetailForm(next);
  }, [setDetailForm]);

  return {
    form: { addName },
    setAddName,
    detailForm,
    setDetailForm,
    dirty,
    save,
    reset,
  };
}
