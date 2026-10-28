import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

type PendingRefresh = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void };
type SyncState = {
  pendingWrites: number;
  generation: number;
  revision: number;
  dirty: boolean;
  inFlight: Promise<void> | null;
  pending: PendingRefresh | null;
};

const states = new WeakMap<QueryClient, SyncState>();
const ROOTS = [queryKeys.bom.all, queryKeys.items.all] as const;

function stateFor(client: QueryClient): SyncState {
  let state = states.get(client);
  if (!state) {
    state = { pendingWrites: 0, generation: 0, revision: -1, dirty: false, inFlight: null, pending: null };
    states.set(client, state);
  }
  return state;
}

function pendingRefresh(state: SyncState): PendingRefresh {
  if (!state.pending) {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    state.pending = { promise, resolve, reject };
  }
  return state.pending;
}

/** Cancellation also discards an initial response from before the saved state. */
async function cancelReads(client: QueryClient): Promise<void> {
  await Promise.all(ROOTS.map(queryKey => client.cancelQueries({ queryKey })));
}

/** One reader owns both roots; newer revisions require a later complete cycle. */
function drain(client: QueryClient, state: SyncState): void {
  if (state.inFlight || state.pendingWrites || !state.dirty) return;
  const task = (async (): Promise<void> => {
    while (state.dirty && state.pendingWrites === 0) {
      await cancelReads(client);
      if (state.pendingWrites) break;
      const generation = state.generation;
      state.dirty = false;
      await Promise.all(ROOTS.map(queryKey => client.invalidateQueries(
        { queryKey }, { throwOnError: true, cancelRefetch: false },
      )));
      if (state.generation !== generation) state.dirty = true;
    }
  })();
  state.inFlight = task;
  void task.then(() => {
    state.inFlight = null;
    if (state.pendingWrites === 0 && !state.dirty) {
      const pending = state.pending;
      state.pending = null;
      pending?.resolve();
    } else drain(client, state);
  }, error => {
    state.inFlight = null;
    state.dirty = true;
    const pending = state.pending;
    state.pending = null;
    pending?.reject(error);
  });
}

/** Merge a realtime revision with any local saves without suppressing later changes. */
export function refreshBomAndItems(client: QueryClient, revision?: number): Promise<void> {
  const state = stateFor(client);
  // A restored database can publish a lower revision; the stream's epoch owns
  // ordering, so every different value must refresh just like the existing UI.
  if (revision !== undefined && revision !== state.revision) {
    state.revision = revision;
    state.generation += 1;
    state.dirty = true;
  } else if (!state.pending && !state.inFlight && !state.dirty) {
    if (revision !== undefined) return Promise.resolve();
    state.generation += 1;
    state.dirty = true;
  }
  const pending = pendingRefresh(state);
  drain(client, state);
  return pending.promise;
}

/** Hold response-dependent reads until confirmed cache writes are complete. */
export function beginBomMutation(client: QueryClient): {
  applyServerResult: (updateCache: () => void) => Promise<void>;
  finish: () => Promise<void>;
} {
  const state = stateFor(client);
  state.pendingWrites += 1;
  state.generation += 1;
  state.dirty = true;
  const cancelled = cancelReads(client);
  let finished: Promise<void> | null = null;
  return {
    async applyServerResult(updateCache): Promise<void> {
      await cancelled;
      // Reads mounted during the write must not replace its confirmed response.
      await cancelReads(client);
      updateCache();
    },
    finish(): Promise<void> {
      if (finished) return finished;
      state.pendingWrites -= 1;
      state.dirty = true;
      const pending = pendingRefresh(state);
      finished = pending.promise;
      drain(client, state);
      return finished;
    },
  };
}
