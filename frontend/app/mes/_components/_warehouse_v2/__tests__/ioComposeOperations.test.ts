// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { IoBundle } from "@/lib/api";
import {
  runWarehousePull,
  saveCompositionDraft,
  runCompositionSubmit,
  useIoComposeOperationState,
  type IoOperationRefs,
} from "../ioComposeOperations";

function operationRefs(): IoOperationRefs {
  return {
    generation: { current: 0 },
    contentRevision: { current: 0 },
  };
}

describe("ioComposeOperations", () => {
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
