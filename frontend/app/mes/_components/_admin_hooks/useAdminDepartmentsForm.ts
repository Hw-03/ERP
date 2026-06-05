"use client";

// W5: Departments 도메인 Form sub-hook.
// 책임: 부서 추가 입력 폼 (addName) + unsaved guard dirty 플래그.
// — 부서 자체는 인라인 편집이 없으므로 form 은 단순 "추가 입력" 1필드 + dirty.

import { useState } from "react";

export type DepartmentForm = {
  addName: string;
};

export type UseAdminDepartmentsFormState = {
  form: DepartmentForm;
  setAddName: (v: string) => void;
  dirty: boolean;
  setDirty: (v: boolean) => void;
  reset: () => void;
};

export function useAdminDepartmentsForm(): UseAdminDepartmentsFormState {
  const [addName, setAddName] = useState("");
  const [dirty, setDirty] = useState(false);

  function reset() {
    setAddName("");
    setDirty(false);
  }

  return {
    form: { addName },
    setAddName,
    dirty,
    setDirty,
    reset,
  };
}
