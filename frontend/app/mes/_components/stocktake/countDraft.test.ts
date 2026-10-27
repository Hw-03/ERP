import { describe, expect, it, vi } from "vitest";
import { CountDraft, type DraftCount } from "./countDraft";

const initial: DraftCount = { count_id: "c", owner_id: "a", version: 1, fence: 2, status: "DRAFT", quantities: { normal: null, defect: null, b_grade: null, obsolete: null } };
function setup(save = vi.fn(async (body) => ({ ...initial, version: body.expected_version + 1, quantities: body.quantities }))) {
  return { save, draft: new CountDraft(initial, save, () => true) };
}
describe("CountDraft", () => {
  it("saves with a UUID key when LAN HTTP has no randomUUID", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const save = vi.fn(async (body, _key?: string) => ({ ...initial, version: body.expected_version + 1, quantities: body.quantities }));
      const { draft } = setup(save);
      draft.edit("normal", "7");
      await draft.flush();
      expect(save.mock.calls[0][1]).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
      expect(draft.dirty).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it("exposes a newer realtime revision immediately when recovery settles an in-flight save", async () => {
    let reject!: (error: Error) => void;
    const { draft } = setup(vi.fn(() => new Promise<DraftCount>((_resolve, fail) => { reject = fail; })));
    draft.edit("normal", "23");
    const pending = draft.flush();
    draft.edit("normal", "24");
    draft.receive({ ...initial, version: 3, quantities: { ...initial.quantities, normal: 25 } });
    draft.resolveReceipt({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 23 } });
    reject(new Error("original response lost"));
    await pending;
    expect(draft.remote?.version).toBe(3);
    expect(draft.values.normal).toBe("24");
    expect(draft.error?.message).toContain("다른 변경");
  });
  it.each(["COMPLETED", "NOT_APPLIED"])("ignores an original request's late failure after %s recovery", async (resolution) => {
    let reject!: (error: Error) => void;
    const { draft, save } = setup(vi.fn(() => new Promise<DraftCount>((_resolve, fail) => { reject = fail; })));
    draft.edit("normal", "23");
    const pending = draft.flush();
    if (resolution === "COMPLETED") draft.resolveReceipt({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 23 } });
    else draft.resolveNotApplied(draft.pendingKey!);
    reject(Object.assign(new Error("late timeout"), { code: "COMMAND_RESULT_UNKNOWN" }));
    await expect(pending).resolves.toBeUndefined();
    expect(draft.ambiguous).toBe(false);
    expect(draft.pendingKey).toBeNull();
    expect(draft.error?.message ?? "").not.toContain("late timeout");
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("keeps a journaled HTTP failure recoverable and reconciles its early realtime result", async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("503"), { code: "SERVER_UNAVAILABLE", extra: { command_pending: true } }));
    const { draft } = setup(save);
    draft.edit("normal", "23");
    await expect(draft.flush()).rejects.toThrow("503");
    expect(draft.pendingKey).toBeTruthy();
    expect(draft.ambiguous).toBe(true);
    const result = { ...initial, version: 2, quantities: { ...initial.quantities, normal: 23 } };
    draft.receive(result);
    draft.resolveReceipt(result);
    expect(draft.remote).toBeNull();
    expect(draft.error).toBeNull();
    expect(draft.dirty).toBe(false);
    expect(draft.count.version).toBe(2);
    expect(draft.values.normal).toBe("23");
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("keeps later local edits and a newer remote version when recovering an older receipt", async () => {
    const { draft } = setup(vi.fn().mockRejectedValue(Object.assign(new Error("unknown"), { code: "COMMAND_RESULT_UNKNOWN" })));
    draft.edit("normal", "23");
    await expect(draft.flush()).rejects.toThrow();
    draft.edit("normal", "24");
    draft.receive({ ...initial, version: 3, quantities: { ...initial.quantities, normal: 25 } });
    draft.resolveReceipt({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 23 } });
    expect(draft.values.normal).toBe("24");
    expect(draft.dirty).toBe(true);
    expect(draft.remote?.version).toBe(3);
    expect(draft.error?.message).toContain("다른 변경");
  });
  it("distinguishes blank from explicit zero and refuses invalid integer input", async () => {
    const { draft, save } = setup();
    draft.edit("normal", "0");
    await draft.flush();
    expect(save.mock.calls[0][0].quantities).toEqual({ normal: 0, defect: null, b_grade: null, obsolete: null });
    draft.edit("defect", "1.5");
    await expect(draft.flush()).rejects.toThrow("정수");
    expect(draft.values.defect).toBe("1.5");
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("serializes edits during a save and flushes the latest value with the returned version", async () => {
    let finish!: (value: DraftCount) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<DraftCount>((resolve) => { finish = resolve; }))
      .mockImplementation(async (body) => ({ ...initial, version: body.expected_version + 1, quantities: body.quantities }));
    const { draft } = setup(save);
    draft.edit("normal", "3");
    const first = draft.flush();
    draft.edit("normal", "4");
    const second = draft.flush();
    expect(save).toHaveBeenCalledTimes(1);
    finish({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 3 } });
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ expected_version: 2, quantities: { normal: 4 } });
    expect(draft.dirty).toBe(false);
    expect(draft.count.version).toBe(3);
  });
  it("keeps failed input and requires a deliberate retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("저장 실패"))
      .mockImplementation(async (body) => ({ ...initial, version: 2, quantities: body.quantities }));
    const { draft } = setup(save);
    draft.edit("normal", "7");
    await expect(draft.flush()).rejects.toThrow("저장 실패");
    expect(draft.dirty).toBe(true);
    expect(draft.values.normal).toBe("7");
    await draft.flush();
    expect(draft.dirty).toBe(false);
  });
  it("preserves local text on a concurrent server revision until explicit reload", async () => {
    const { draft, save } = setup();
    draft.edit("normal", "7");
    draft.receive({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 8 } });
    expect(draft.values.normal).toBe("7");
    await expect(draft.flush()).rejects.toThrow("다른 변경");
    expect(save).not.toHaveBeenCalled();
    draft.acceptServer();
    expect(draft.values.normal).toBe("8");
    expect(draft.dirty).toBe(false);
  });
  it("does not send another employee's queued draft", async () => {
    let sameActor = true;
    const save = vi.fn();
    const draft = new CountDraft(initial, save, () => sameActor);
    draft.edit("normal", "7");
    sameActor = false;
    await expect(draft.flush()).rejects.toThrow("작업자");
    expect(save).not.toHaveBeenCalled();
    expect(draft.values.normal).toBe("7");
  });
  it("detects a closed round without a count version increment", async () => {
    const { draft, save } = setup();
    draft.edit("normal", "7");
    draft.receive({ ...initial, status: "CLOSED_UNAPPLIED" });
    await expect(draft.flush()).rejects.toThrow("다른 변경");
    expect(save).not.toHaveBeenCalled();
  });
  it("requires receipt recovery after an ambiguous result without resending", async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("결과 확인 필요"), { code: "COMMAND_RESULT_UNKNOWN" }));
    const { draft } = setup(save);
    draft.edit("normal", "7");
    await expect(draft.flush()).rejects.toThrow("결과 확인");
    await expect(draft.flush()).rejects.toThrow("결과 확인");
    expect(save).toHaveBeenCalledTimes(1);
    expect(draft.pendingKey).toBeTruthy();
    draft.resolveReceipt({ ...initial, version: 2, quantities: { ...initial.quantities, normal: 7 } });
    expect(draft.dirty).toBe(false);
  });

  it("keeps unsaved observations after a matching non-application fence and requires explicit save", async () => {
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("unknown"), { code: "COMMAND_RESULT_UNKNOWN" }));
    const { draft } = setup(save);
    draft.edit("normal", "7");
    await expect(draft.flush()).rejects.toThrow();
    const key = draft.pendingKey!;
    draft.resolveNotApplied("other");
    expect(draft.ambiguous).toBe(true);
    draft.resolveNotApplied(key);
    expect(draft.ambiguous).toBe(false);
    expect(draft.pendingKey).toBeNull();
    expect(draft.values.normal).toBe("7");
    expect(draft.dirty).toBe(true);
    expect(draft.error?.message).toContain("미반영");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
