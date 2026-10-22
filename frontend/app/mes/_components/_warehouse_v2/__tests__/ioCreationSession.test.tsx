// @vitest-environment jsdom
import { useRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch, type IoSubmitResponse } from "@/lib/api";
import { ApiConnectionError, ApiError } from "@/lib/api-core";
import { useIoDraft } from "../useIoDraft";
import { useIoSubmit } from "../useIoSubmit";

vi.mock("@/lib/api", () => ({ api: { saveDraft: vi.fn(), submit: vi.fn() } }));
const payload = { employeeId: "employee", workType: "process" as const, subType: "produce" as const, bundles: [] };
beforeEach(() => vi.clearAllMocks());

function useCreationSession() {
  const creationKey = useRef<string | null>(null);
  return {
    creationKey,
    draft: useIoDraft(undefined, undefined, undefined, creationKey),
    direct: useIoSubmit(undefined, undefined, creationKey),
  };
}

it.each(["draft", "direct_submit"] as const)("%s 생성 성공 응답이 유실되어도 반대 명령으로 같은 작업을 새로 생성하지 않는다", async (firstCommand) => {
  const serverCreations = new Map<string, string>();
  const create = (command: string, key?: string | null) => {
    if (serverCreations.has(key!)) throw new ApiError("같은 생성 키의 명령이 다릅니다", 409, "creation_command_conflict");
    serverCreations.set(key!, command);
    if (command === firstCommand) throw new ApiConnectionError();
  };
  vi.mocked(api.saveDraft).mockImplementation(async (request) => {
    create("draft", request.client_request_id);
    return { batch_id: "duplicate", revision: 1 } as IoBatch;
  });
  vi.mocked(api.submit).mockImplementation(async (request) => {
    create("direct_submit", request.client_request_id);
    return { batch: { batch_id: "duplicate", revision: 1 } } as IoSubmitResponse;
  });
  const { result } = renderHook(useCreationSession);
  await act(async () => {
    const first = firstCommand === "draft" ? result.current.draft.saveDraft(payload) : result.current.direct.submit(payload);
    await expect(first).rejects.toBeInstanceOf(ApiConnectionError);
  });
  await act(async () => {
    const second = firstCommand === "draft" ? result.current.direct.submit(payload) : result.current.draft.saveDraft(payload);
    await expect(second).rejects.toMatchObject({ status: 409 });
  });
  expect(serverCreations.size).toBe(1);
  expect(api.saveDraft).toHaveBeenCalledOnce();
  expect(api.submit).toHaveBeenCalledOnce();
  expect(vi.mocked(api.saveDraft).mock.calls[0][0].client_request_id).toBe(vi.mocked(api.submit).mock.calls[0][0].client_request_id);
});

it("다른 세션으로 전환한 뒤 늦게 끝난 직접 제출이 새 작업 생성 키를 지우지 않는다", async () => {
  let finish!: (response: IoSubmitResponse) => void;
  vi.mocked(api.submit).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  vi.mocked(api.saveDraft).mockRejectedValueOnce(new ApiConnectionError());
  const { result } = renderHook(useCreationSession);
  let pending!: Promise<IoSubmitResponse>;
  act(() => { pending = result.current.direct.submit(payload); });
  const oldKey = result.current.creationKey.current;
  act(() => { result.current.draft.resetSession(); result.current.direct.resetSession(); });
  await act(async () => { await result.current.draft.saveDraft(payload).catch(() => {}); });
  const newKey = result.current.creationKey.current;
  await act(async () => { finish({ batch: { batch_id: "old-completed" } } as IoSubmitResponse); await pending; });
  expect(newKey).not.toBe(oldKey);
  expect(result.current.creationKey.current).toBe(newKey);
});

it("원작업 보관과 복귀는 저장·직접 제출이 공유하는 생성 키를 함께 복원한다", async () => {
  vi.mocked(api.submit).mockRejectedValue(new ApiConnectionError());
  vi.mocked(api.saveDraft).mockRejectedValue(new ApiConnectionError());
  const { result } = renderHook(useCreationSession);
  await act(async () => { await result.current.direct.submit(payload).catch(() => {}); });
  const originalKey = result.current.creationKey.current;
  const restoreDraft = result.current.draft.captureSession();
  const restoreDirect = result.current.direct.captureSession();
  act(() => { result.current.draft.resetSession(); result.current.direct.resetSession(); });
  await act(async () => { await result.current.draft.saveDraft(payload).catch(() => {}); });
  expect(result.current.creationKey.current).not.toBe(originalKey);
  act(() => { restoreDraft(); restoreDirect(); });
  expect(result.current.creationKey.current).toBe(originalKey);
  await act(async () => { await result.current.draft.saveDraft(payload).catch(() => {}); });
  expect(vi.mocked(api.saveDraft).mock.calls.at(-1)?.[0].client_request_id).toBe(originalKey);
});

it("직접 제출 성공 뒤 다음 작업은 새 생성 키를 사용한다", async () => {
  vi.mocked(api.submit).mockResolvedValueOnce({ batch: { batch_id: "completed" } } as IoSubmitResponse);
  vi.mocked(api.saveDraft).mockRejectedValueOnce(new ApiConnectionError());
  const { result } = renderHook(useCreationSession);
  await act(async () => { await result.current.direct.submit(payload); });
  expect(result.current.creationKey.current).toBeNull();
  const completedKey = vi.mocked(api.submit).mock.calls[0][0].client_request_id;
  await act(async () => { await result.current.draft.saveDraft(payload).catch(() => {}); });
  expect(result.current.creationKey.current).not.toBe(completedKey);
});
