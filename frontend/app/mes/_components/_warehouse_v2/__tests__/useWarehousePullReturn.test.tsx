import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useIoWorkState } from "../useIoWorkState";
import { useWarehousePullReturn } from "../useWarehousePullReturn";

describe("부족품 가져오기 원작업 복귀", () => {
  it.each(["original-draft", null])("원작업 %s의 URL 연결과 편집 상태를 함께 복원한다", (originalId) => {
    const restoreSession = vi.fn();
    const onRestored = vi.fn();
    const { result } = renderHook(() => {
      const state = useIoWorkState("process", "튜브");
      const batchId = useRef<string | null>(originalId);
      const returner = useWarehousePullReturn(state, batchId, () => restoreSession, onRestored);
      return { state, batchId, returner };
    });
    act(() => {
      result.current.state.setNotes("원작업 메모");
      result.current.state.setReferenceNo("원작업 번호");
      result.current.state.goTo(4);
    });
    const restore = result.current.returner.capture();
    act(() => {
      result.current.batchId.current = "saved-pull-draft";
      result.current.state.setWorkType("warehouse_io");
      result.current.state.setNotes("창고 작업 메모");
      result.current.returner.retain(restore);
    });
    act(() => result.current.returner.resume?.());

    expect(result.current.batchId.current).toBe(originalId);
    expect(result.current.state.notes).toBe("원작업 메모");
    expect(result.current.state.referenceNo).toBe("원작업 번호");
    expect(result.current.state.fromDepartment).toBe("튜브");
    expect(result.current.state.step).toBe(4);
    expect(restoreSession).toHaveBeenCalledOnce();
    expect(onRestored).toHaveBeenCalledWith(originalId, 4, "saved-pull-draft");
    expect(result.current.returner.pending).toBe(false);
  });
});
