import type { APIResponse, Route } from "@playwright/test";
import { test as commonTest } from "./_common-expectations";

/** Keep this worker's Node API pool separate from ordinary keep-alive fixtures. */
export const test = commonTest.extend<Record<never, never>, { isolatedApiWorker: boolean }>({
  isolatedApiWorker: [true, { scope: "worker", auto: true }],
  request: async ({ playwright, extraHTTPHeaders }, runFixture) => {
    // API contexts share an agent: a new context alone does not isolate idle sockets.
    const request = await playwright.request.newContext({
      extraHTTPHeaders: { ...extraHTTPHeaders, connection: "close" },
    });
    try { await runFixture(request); }
    finally { await request.dispose(); }
  },
});

/** Preserve the intercepted request while closing only the Node-side fetch connection. */
export async function fetchWithoutIdleReuse(route: Route): Promise<APIResponse> {
  return route.fetch({ headers: { ...await route.request().allHeaders(), connection: "close" }, maxRetries: 0 });
}
