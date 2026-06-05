import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdminDepartmentsForm } from "../useAdminDepartmentsForm";

describe("useAdminDepartmentsForm", () => {
  it("초기 상태 — addName 빈 문자열, dirty=false", () => {
    const { result } = renderHook(() => useAdminDepartmentsForm());
    expect(result.current.form.addName).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("setAddName 으로 값 변경", () => {
    const { result } = renderHook(() => useAdminDepartmentsForm());
    act(() => {
      result.current.setAddName("새 부서");
    });
    expect(result.current.form.addName).toBe("새 부서");
  });

  it("setDirty 로 dirty 토글", () => {
    const { result } = renderHook(() => useAdminDepartmentsForm());
    act(() => {
      result.current.setDirty(true);
    });
    expect(result.current.dirty).toBe(true);
    act(() => {
      result.current.setDirty(false);
    });
    expect(result.current.dirty).toBe(false);
  });

  it("reset — addName 비우고 dirty=false", () => {
    const { result } = renderHook(() => useAdminDepartmentsForm());
    act(() => {
      result.current.setAddName("X");
      result.current.setDirty(true);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.form.addName).toBe("");
    expect(result.current.dirty).toBe(false);
  });
});
