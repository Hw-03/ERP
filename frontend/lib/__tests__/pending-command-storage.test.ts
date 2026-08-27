// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultUnknownError } from "../api-core";
import { runPendingCommand } from "../pending-command-storage";

afterEach(() => sessionStorage.clear());

describe("runPendingCommand", () => {
  it("동일 scope의 결과 불명 전송을 single-flight로 공유하고 exact snapshot을 보존한다", async () => {
    let rejectRequest: (error: unknown) => void = () => undefined;
    const execute = vi.fn(() => new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const original = { client_request_id: "key-1", quantity: 1 };

    const first = runPendingCommand("test:scope", original, execute);
    const second = runPendingCommand(
      "test:scope",
      { client_request_id: "key-2", quantity: 9 },
      execute,
    );

    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
    rejectRequest(new ResultUnknownError());
    await expect(first).rejects.toBeInstanceOf(ResultUnknownError);
    await expect(second).rejects.toBeInstanceOf(ResultUnknownError);

    const replay = vi.fn(async (request: typeof original) => request);
    await expect(runPendingCommand(
      "test:scope",
      { client_request_id: "key-3", quantity: 99 },
      replay,
    )).resolves.toEqual(original);
    expect(replay).toHaveBeenCalledWith(original);
  });
});
