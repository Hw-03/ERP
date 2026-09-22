import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useIoWorkState } from "../useIoWorkState";

it("requires an explicit warehouse direction and restores a saved choice", () => {
  const { result } = renderHook(() => useIoWorkState());
  act(() => result.current.setWorkType("warehouse_io"));
  expect(result.current.canAdvance[2]).toBe(false);
  expect(result.current.deptIoDirection).toBeNull();
  act(() => result.current.setSubType("dept_to_warehouse"));
  expect(result.current.canAdvance[2]).toBe(true);
  expect(result.current.deptIoDirection).toBe("in");
  act(() => result.current.setWorkType("warehouse_io"));
  expect(result.current.canAdvance[2]).toBe(false);
  act(() => result.current.setSubType("warehouse_to_dept"));
  expect(result.current.deptIoDirection).toBe("out");
  expect(result.current.canAdvance[2]).toBe(true);
});
