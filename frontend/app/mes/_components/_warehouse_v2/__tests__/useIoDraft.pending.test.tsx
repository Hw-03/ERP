import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useIoDraft } from "../useIoDraft";

const save = vi.fn();
vi.mock("@/lib/api", () => ({ api: { saveDraft: (...args: unknown[]) => save(...args) } }));
beforeEach(() => { sessionStorage.clear(); save.mockReset(); });

it("결과 불명인 초안의 원본을 수정 저장하지 않는다", async () => {
  sessionStorage.setItem("i:employee-1", JSON.stringify({ batch_id: "draft-1" }));
  const { result } = renderHook(() => useIoDraft());
  await act(async () => {
    await expect(result.current.saveDraft({
      employeeId: "employee-1", workType: "receive", subType: "receive_supplier", batchId: "draft-1", bundles: [],
    })).rejects.toMatchObject({ name: "PendingIoRequestError" });
  });
  expect(save).not.toHaveBeenCalled();
});

it("기존 draft-submit pending 초안도 결과 확인 전에 수정 저장하지 않는다", async () => {
  sessionStorage.setItem("io:draft-submit:employee-1", JSON.stringify({
    batchId: "draft-1",
    employeeId: "employee-1",
  }));
  const { result } = renderHook(() => useIoDraft());

  await act(async () => {
    await expect(result.current.saveDraft({
      employeeId: "employee-1", workType: "receive", subType: "receive_supplier", batchId: "draft-1", bundles: [],
    })).rejects.toMatchObject({ name: "PendingIoRequestError" });
  });

  expect(save).not.toHaveBeenCalled();
});
