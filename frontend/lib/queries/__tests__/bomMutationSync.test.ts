import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginBomMutation, refreshBomAndItems } from "../bomMutationSync";
import { queryKeys } from "../keys";

const clients: QueryClient[] = [];
const stops: Array<() => void> = [];

function client(): QueryClient {
  const next = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(next);
  return next;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function observe(qc: QueryClient, key: readonly string[], read: () => Promise<string[]>): void {
  qc.setQueryData(key, ["before"]);
  const observer = new QueryObserver(qc, { queryKey: key, queryFn: read, staleTime: Infinity, retry: false });
  stops.push(observer.subscribe(() => {}));
}

afterEach(() => {
  stops.splice(0).forEach(stop => stop());
  clients.splice(0).forEach(qc => qc.clear());
});

describe("BOM mutation synchronization", () => {
  it("cancels an older read before applying a confirmed response", async () => {
    const qc = client();
    const old = deferred<string[]>();
    const key = queryKeys.bom.detail("parent");
    const before = qc.fetchQuery({ queryKey: key, queryFn: () => old.promise }).catch(() => undefined);
    const mutation = beginBomMutation(qc);
    await mutation.applyServerResult(() => qc.setQueryData(key, ["saved"]));
    old.resolve(["old"]);
    await before;
    expect(qc.getQueryData(key)).toEqual(["saved"]);
    await mutation.finish();
    expect(qc.getQueryData(key)).toEqual(["saved"]);
  });

  it("defers and merges realtime refreshes until all writes finish", async () => {
    const qc = client();
    const readBom = vi.fn().mockResolvedValue(["server"]);
    const readItems = vi.fn().mockResolvedValue(["server"]);
    observe(qc, queryKeys.bom.list(), readBom);
    observe(qc, queryKeys.items.list(), readItems);
    const first = beginBomMutation(qc);
    const second = beginBomMutation(qc);
    const realtime = refreshBomAndItems(qc, 3);
    expect(refreshBomAndItems(qc, 3)).toBe(realtime);
    const firstFinished = first.finish();
    await Promise.resolve();
    expect(readBom).not.toHaveBeenCalled();
    expect(readItems).not.toHaveBeenCalled();
    await second.applyServerResult(() => qc.setQueryData(queryKeys.bom.list(), ["confirmed"]));
    await Promise.all([realtime, firstFinished, second.finish()]);
    expect(readBom).toHaveBeenCalledTimes(1);
    expect(readItems).toHaveBeenCalledTimes(1);
  });

  it("shares a cycle but follows up when a newer revision arrives during its read", async () => {
    const qc = client();
    const initial = deferred<string[]>();
    const latest = deferred<string[]>();
    const read = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(latest.promise);
    observe(qc, queryKeys.bom.list(), read);
    const cycle = refreshBomAndItems(qc, 1);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(refreshBomAndItems(qc, 1)).toBe(cycle);
    const newer = refreshBomAndItems(qc, 2);
    refreshBomAndItems(qc, 3);
    expect(read).toHaveBeenCalledTimes(1);
    initial.resolve(["first"]);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    latest.resolve(["latest"]);
    await Promise.all([cycle, newer]);
    expect(qc.getQueryData(queryKeys.bom.list())).toEqual(["latest"]);
    await refreshBomAndItems(qc, 3);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("retains confirmed values when background refresh fails and allows a later retry", async () => {
    const qc = client();
    const failure = new Error("read unavailable");
    const read = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(["recovered"]);
    observe(qc, queryKeys.bom.list(), read);
    const mutation = beginBomMutation(qc);
    await mutation.applyServerResult(() => qc.setQueryData(queryKeys.bom.list(), ["saved"]));
    await expect(mutation.finish()).rejects.toBe(failure);
    expect(qc.getQueryData(queryKeys.bom.list())).toEqual(["saved"]);
    await refreshBomAndItems(qc);
    expect(qc.getQueryData(queryKeys.bom.list())).toEqual(["recovered"]);
  });

  it("refreshes active data again when a restored database publishes a lower revision", async () => {
    const qc = client();
    const read = vi.fn().mockResolvedValueOnce(["revision 7"]).mockResolvedValueOnce(["restored 3"]);
    observe(qc, queryKeys.bom.list(), read);
    await refreshBomAndItems(qc, 7);
    await refreshBomAndItems(qc, 3);
    expect(read).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(queryKeys.bom.list())).toEqual(["restored 3"]);
  });

  it("cancels a refresh interrupted by another write and reads after its confirmed patch", async () => {
    const qc = client();
    const old = deferred<string[]>();
    const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(["latest"]);
    observe(qc, queryKeys.bom.list(), read);
    const cycle = refreshBomAndItems(qc, 1);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const mutation = beginBomMutation(qc);
    await mutation.applyServerResult(() => qc.setQueryData(queryKeys.bom.list(), ["saved"]));
    old.resolve(["obsolete"]);
    await mutation.finish();
    await cycle;
    expect(qc.getQueryData(queryKeys.bom.list())).toEqual(["latest"]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("refreshes only active BOM and item keys and releases each write once", async () => {
    const qc = client();
    const other = vi.fn().mockResolvedValue(["other"]);
    observe(qc, ["unrelated"], other);
    qc.setQueryData(queryKeys.bom.detail("inactive"), ["cached"]);
    const mutation = beginBomMutation(qc);
    const done = mutation.finish();
    expect(mutation.finish()).toBe(done);
    await done;
    expect(other).not.toHaveBeenCalled();
    expect(qc.getQueryState(queryKeys.bom.detail("inactive"))?.isInvalidated).toBe(true);
  });
});
