// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { IoBundle } from "@/lib/api";
import {
  runWarehousePull,
  saveCompositionDraft,
  runCompositionSubmit,
  recoverCompositionSubmit,
  useIoComposeOperationState,
  type IoOperationRefs,
} from "../ioComposeOperations";
import { PendingIoRequestError, toIoSubmitRequest } from "../ioPendingRequest";

function operationRefs(): IoOperationRefs {
  return {
    generation: { current: 0 },
    contentRevision: { current: 0 },
  };
}

describe("ioComposeOperations", () => {
  it("직원 화면이 unmount되면 늦은 복구 결과를 새 화면에 알리지 않는다", async () => {
    const refs = { ...operationRefs(), mounted: { current: true } };
    const setResult = vi.fn();
    const onStatusChange = vi.fn();
    const reset = vi.fn();
    const input = { employeeId: "employee-1", workType: "receive" as const, subType: "receive_supplier" as const, bundles: [] };
    await recoverCompositionSubmit({
      recover: async () => {
        refs.mounted.current = false;
        return { request: toIoSubmitRequest(input), response: { requires_approval: false, message: "반영 완료" } as never };
      },
      getCurrentInput: () => input, operationRefs: refs,
      setResult, reset, resetFilters: vi.fn(), onStatusChange,
      refreshItems: async () => [], setItems: vi.fn(),
    });
    expect(setResult).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each([false, true])("복구 중 작업이 바뀌어도 이전 요청 결과를 알리고 새 입력은 보존한다: failed=%s", async (failed) => {
    const refs = operationRefs();
    const reset = vi.fn();
    const setResult = vi.fn();
    const input = { employeeId: "employee-1", workType: "receive" as const, subType: "receive_supplier" as const, bundles: [] };
    await recoverCompositionSubmit({
      recover: async () => {
        refs.generation.current += 1;
        if (failed) throw new PendingIoRequestError();
        return { request: toIoSubmitRequest(input), response: { requires_approval: false, message: "반영 완료" } as never };
      },
      getCurrentInput: () => input,
      operationRefs: refs,
      setResult, reset, resetFilters: vi.fn(), onStatusChange: vi.fn(),
      refreshItems: async () => [], setItems: vi.fn(),
    });
    expect(reset).not.toHaveBeenCalled();
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({ title: failed ? "처리 결과 확인 필요" : "이전 요청 완료" }));
  });

  it("결과 불명은 입력을 초기화하지 않고 결과 확인 필요로 안내한다", async () => {
    const reset = vi.fn();
    const setResult = vi.fn();
    await runCompositionSubmit(
      "employee-1", "receive_supplier", "조립", async () => {},
      () => [], { current: null }, async () => { throw new PendingIoRequestError(); },
      vi.fn(), vi.fn(), setResult, reset, vi.fn(), vi.fn(), async () => [], vi.fn(),
    );
    expect(reset).not.toHaveBeenCalled();
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({ title: "처리 결과 확인 필요" }));
  });

  it.each([false, true])("원 요청 확인 뒤 현재 입력이 다르면 보존한다: changed=%s", async (changed) => {
    const initial = {
      employeeId: "employee-1", workType: "receive" as const, subType: "receive_supplier" as const,
      bundles: [{ bundle_id: "bundle-1", title: "품목", quantity: 1, lines: [] } as unknown as IoBundle],
    };
    const current = { ...initial, bundles: [{ ...initial.bundles[0], quantity: changed ? 9 : 1 }] };
    const reset = vi.fn();
    const resetFilters = vi.fn();
    const setResult = vi.fn();
    const onSubmitSuccess = vi.fn();
    await recoverCompositionSubmit({
      recover: async () => ({
        request: { ...toIoSubmitRequest(initial), client_request_id: "original-key" },
        response: { requires_approval: false, message: "입출고가 반영되었습니다." } as never,
      }),
      getCurrentInput: () => current,
      operationRefs: operationRefs(),
      setResult, reset, resetFilters, onStatusChange: vi.fn(),
      refreshItems: async () => [], setItems: vi.fn(), onSubmitSuccess,
    });
    expect(reset).toHaveBeenCalledTimes(changed ? 0 : 1);
    expect(resetFilters).toHaveBeenCalledTimes(changed ? 0 : 1);
    expect(onSubmitSuccess).toHaveBeenCalledTimes(changed ? 0 : 1);
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "success", title: "이전 요청 완료",
      message: changed ? expect.stringContaining("현재 입력은 보존") : expect.any(String),
    }));
  });

  it("복구 응답 batch가 원 draft와 다르면 현재 입력을 초기화하지 않는다", async () => {
    const initial = {
      employeeId: "employee-1", workType: "receive" as const, subType: "receive_supplier" as const,
      batchId: "draft-current",
      bundles: [{ bundle_id: "bundle-1", title: "품목", quantity: 1, lines: [] } as unknown as IoBundle],
    };
    const reset = vi.fn();
    const onDraftSubmitted = vi.fn();
    const setResult = vi.fn();

    await recoverCompositionSubmit({
      recover: async () => ({
        request: { ...toIoSubmitRequest(initial), client_request_id: "original-key" },
        response: {
          batch: { batch_id: "draft-other" },
          requires_approval: false,
          message: "다른 임시저장 요청 완료",
        } as never,
      }),
      getCurrentInput: () => initial,
      operationRefs: operationRefs(),
      setResult,
      reset,
      resetFilters: vi.fn(),
      onStatusChange: vi.fn(),
      refreshItems: async () => [],
      setItems: vi.fn(),
      onDraftSubmitted,
    });

    expect(reset).not.toHaveBeenCalled();
    expect(onDraftSubmitted).not.toHaveBeenCalled();
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      message: expect.stringContaining("현재 작업은 보존"),
    }));
  });

  it("최초 제출 응답 전에 내용이 바뀌면 성공을 알리고 현재 입력은 초기화하지 않는다", async () => {
    const refs = operationRefs();
    const reset = vi.fn();
    const resetFilters = vi.fn();
    const onSubmitSuccess = vi.fn();
    const setResult = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never],
      { current: null },
      async () => {
        refs.contentRevision.current += 1;
        return { requires_approval: false, message: "완료" } as never;
      },
      vi.fn(), vi.fn(), setResult, reset, resetFilters, vi.fn(), async () => [], vi.fn(),
      onSubmitSuccess, undefined, undefined, refs,
    );

    expect(reset).not.toHaveBeenCalled();
    expect(resetFilters).not.toHaveBeenCalled();
    expect(onSubmitSuccess).not.toHaveBeenCalled();
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "success",
      message: expect.stringContaining("현재 입력은 보존"),
    }));
  });

  it("초안 제출 중 작업이 교체되면 완료 초안만 알리고 새 초안 연결은 보존한다", async () => {
    const refs = operationRefs();
    const draftRef = { current: "draft-old" as string | null };
    const reset = vi.fn();
    const onDraftSubmitted = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never],
      draftRef,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      reset,
      vi.fn(),
      vi.fn(),
      async () => [],
      vi.fn(),
      undefined,
      async () => {
        draftRef.current = "draft-new";
        refs.generation.current += 1;
        return {
          batch: { batch_id: "draft-old" },
          requires_approval: false,
          message: "완료",
        } as never;
      },
      onDraftSubmitted,
      refs,
      async () => ({ batch_id: "draft-old" }),
    );

    expect(onDraftSubmitted).toHaveBeenCalledWith("draft-old");
    expect(draftRef.current).toBe("draft-new");
    expect(reset).not.toHaveBeenCalled();
  });

  it("저장 응답 뒤 내용이 바뀌면 batch id만 보존하고 성공 전환은 막는다", async () => {
    const refs = operationRefs();
    const retainBatchId = vi.fn();
    const result = await saveCompositionDraft(
      refs,
      async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never],
      async () => {
        refs.contentRevision.current += 1;
        return { batch_id: "draft-1" };
      },
      retainBatchId,
    );

    expect(retainBatchId).toHaveBeenCalledWith("draft-1");
    expect(result).toBeNull();
  });

  it("preview 도중 작업이 바뀌면 완료 콜백 없이 pulling을 해제한다", async () => {
    const refs = operationRefs();
    const pullingRef = { current: false };
    const setPulling = vi.fn();
    const onComplete = vi.fn();

    await runWarehousePull(
      refs,
      pullingRef,
      setPulling,
      ["item-1", "item-2"],
      async () => "draft-1",
      async (itemId) => {
        refs.generation.current += 1;
        return [{ bundle_id: `bundle-${itemId}`, lines: [] } as never];
      },
      onComplete,
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(pullingRef.current).toBe(false);
    expect(setPulling).toHaveBeenNthCalledWith(1, true);
    expect(setPulling).toHaveBeenLastCalledWith(false);
  });

  it("복원된 초안은 삭제하지 않고 같은 batch 제출 경로를 사용한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const deleteDraft = vi.fn(async () => {});
    const submitNew = vi.fn(async () => ({
      batch_id: "submitted-new",
      requires_approval: true,
      message: "new",
    } as never));
    const submitExisting = vi.fn(async () => ({
      batch_id: "draft-1",
      requires_approval: true,
      message: "ok",
      stock_requests: [{ approval_kind: "warehouse" }, { approval_kind: "warehouse" }],
    } as never));
    const onDraftSubmitted = vi.fn();

    const setResult = vi.fn();
    await runCompositionSubmit(
      "employee-1",
      "internal_use_out",
      "조립",
      async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never],
      batchRef,
      submitNew,
      vi.fn(),
      vi.fn(),
      setResult,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      async () => [],
      vi.fn(),
      undefined,
      submitExisting,
      onDraftSubmitted,
      operationRefs(),
      async () => ({ batch_id: "draft-1" }),
    );

    expect(deleteDraft).not.toHaveBeenCalled();
    expect(submitNew).not.toHaveBeenCalled();
    expect(submitExisting).toHaveBeenCalledWith("draft-1");
    expect(batchRef.current).toBeNull();
    expect(onDraftSubmitted).toHaveBeenCalledWith("draft-1");
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "success",
      title: "위치별 결재 요청 완료",
    }));
  });

  it("기존 초안 제출 실패 시 batch 연결을 보존한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const submitExisting = vi.fn(async () => { throw new Error("제출 실패"); });
    const setResult = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_out", "조립", async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never], batchRef,
      vi.fn(), vi.fn(), vi.fn(), setResult, vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting, undefined,
      operationRefs(), async () => ({ batch_id: "draft-1" }),
    );

    expect(batchRef.current).toBe("draft-1");
    expect(submitExisting).toHaveBeenCalledWith("draft-1");
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
  });

  it("이전 pending draft가 먼저 복구되면 현재 다른 draft 연결을 지우지 않는다", async () => {
    const batchRef = { current: "draft-new" as string | null };
    const setResult = vi.fn();
    const onDraftSubmitted = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {},
      () => [{ bundle_id: "bundle-new", lines: [] } as never], batchRef,
      vi.fn(), vi.fn(), vi.fn(), setResult, vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined,
      vi.fn(async () => ({
        batch: { batch_id: "draft-pending" },
        requires_approval: false,
        message: "이전 작업 완료",
      } as never)),
      onDraftSubmitted,
      operationRefs(),
      async () => ({ batch_id: "draft-new" }),
    );

    expect(batchRef.current).toBe("draft-new");
    expect(onDraftSubmitted).not.toHaveBeenCalled();
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      message: expect.stringContaining("이전 결과 불명 작업"),
    }));
  });

  it("기존 초안은 현재 snapshot을 먼저 저장한 뒤 같은 batch를 제출한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const refs = operationRefs();
    const events: string[] = [];
    const bundles = [
      { bundle_id: "bundle-1", lines: [] },
      { bundle_id: "bundle-2", lines: [] },
    ] as unknown as IoBundle[];
    const saveExisting = vi.fn(async (snapshot: IoBundle[]) => {
      events.push("save");
      expect(snapshot).toBe(bundles);
      return { batch_id: "draft-1" };
    });
    const submitExisting = vi.fn(async () => {
      events.push("submit");
      return { requires_approval: false, message: "완료" } as never;
    });

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {}, () => bundles, batchRef,
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting, undefined, refs, saveExisting,
    );

    expect(saveExisting).toHaveBeenCalledWith(bundles);
    expect(submitExisting).toHaveBeenCalledWith("draft-1");
    expect(events).toEqual(["save", "submit"]);
    expect(batchRef.current).toBeNull();
  });

  it("기존 초안 저장 실패 시 제출하지 않고 재확인 오류와 draft 연결을 유지한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const submitExisting = vi.fn();
    const setResult = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {}, () => [{ bundle_id: "bundle-1", lines: [] } as never], batchRef,
      vi.fn(), vi.fn(), vi.fn(), setResult, vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting, undefined, operationRefs(), async () => { throw new Error("저장 실패"); },
    );

    expect(submitExisting).not.toHaveBeenCalled();
    expect(batchRef.current).toBe("draft-1");
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      message: expect.stringContaining("저장 실패"),
    }));
  });

  it("기존 초안 저장 중 내용이 바뀌면 제출하지 않고 draft 연결을 유지한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const refs = operationRefs();
    const submitExisting = vi.fn();
    const setResult = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {}, () => [{ bundle_id: "bundle-1", lines: [] } as never], batchRef,
      vi.fn(), vi.fn(), vi.fn(), setResult, vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting, undefined, refs, async () => {
        refs.contentRevision.current += 1;
        return { batch_id: "draft-1" };
      },
    );

    expect(submitExisting).not.toHaveBeenCalled();
    expect(batchRef.current).toBe("draft-1");
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      message: expect.stringContaining("내용이 변경"),
    }));
  });

  it("기존 초안 저장 응답 ID가 다르면 제출하지 않고 draft 연결을 유지한다", async () => {
    const batchRef = { current: "draft-1" as string | null };
    const submitExisting = vi.fn();
    const setResult = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {}, () => [{ bundle_id: "bundle-1", lines: [] } as never], batchRef,
      vi.fn(), vi.fn(), vi.fn(), setResult, vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting, undefined, operationRefs(), async () => ({ batch_id: "other-draft" }),
    );

    expect(submitExisting).not.toHaveBeenCalled();
    expect(batchRef.current).toBe("draft-1");
    expect(setResult).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      message: expect.stringContaining("다른 작업"),
    }));
  });

  it("새 작업은 기존 일반 제출 경로를 유지한다", async () => {
    const batchRef = { current: null as string | null };
    const submitNew = vi.fn(async () => ({
      batch_id: "new-batch", requires_approval: false, message: "완료",
    } as never));
    const submitExisting = vi.fn();

    await runCompositionSubmit(
      "employee-1", "adjust_in", "조립", async () => {},
      () => [{ bundle_id: "bundle-1", lines: [] } as never], batchRef,
      submitNew, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), async () => [], vi.fn(),
      undefined, submitExisting,
    );

    expect(submitNew).toHaveBeenCalledOnce();
    expect(submitExisting).not.toHaveBeenCalled();
  });

  it("내용 변경과 작업 교체 세대를 서로 다른 ref로 추적한다", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value, draftId }) => useIoComposeOperationState([value], draftId, 0),
      { initialProps: { value: "a", draftId: "draft-a" } },
    );
    const refs = result.current[6];
    const initialContent = refs.contentRevision.current;
    const initialGeneration = refs.generation.current;

    rerender({ value: "b", draftId: "draft-a" });
    expect(refs.contentRevision.current).toBeGreaterThan(initialContent);
    expect(refs.generation.current).toBe(initialGeneration);

    act(() => result.current[7]());
    expect(refs.generation.current).toBe(initialGeneration + 1);
    unmount();
    expect(refs.generation.current).toBe(initialGeneration + 2);
  });
});
