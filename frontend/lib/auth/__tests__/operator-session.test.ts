// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticateEmployee, clearOperatorSession, issueSession, readOperatorSession, restoreOperatorSession,
  revokeOperatorSession, validateTabOwnership,
} from "../operator-session";

const expires = "2030-01-01T00:00:00Z";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  clearOperatorSession();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("tab operator session", () => {
  it("preserves the new employee token when the previous workspace renders during login completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      employee: { employee_id: "employee-b", name: "New worker" },
      operator_session: { token: "new-employee-token", expires_at: expires },
    })));
    const authenticated = await authenticateEmployee("employee-b", "2222");

    // The old workspace can rerender while completeLogin waits for app-session.
    expect(restoreOperatorSession("employee-a")).toBeNull();
    expect(restoreOperatorSession("employee-b")).toEqual(authenticated.session);
    expect(JSON.parse(window.sessionStorage.getItem("dexcowin_mes_operator_session")!)).toEqual(authenticated.session);
  });

  it("authenticates once through verify-pin with tab_id and stores no PIN", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      employee: { employee_id: "employee-1", name: "Worker" },
      operator_session: { token: "secret-token", expires_at: expires },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const issued = await authenticateEmployee("employee-1", "1234");
    expect(issued.employee).toMatchObject({ employee_id: "employee-1" });
    expect(issued.session.token).toBe("secret-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/employee-1/verify-pin");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ pin: "1234", tab_id: issued.session.tab_id });
    expect(JSON.stringify(window.sessionStorage)).not.toContain("1234");
    expect(restoreOperatorSession("employee-1")).toEqual(issued.session);
  });

  it("ends a stalled PIN authentication within the request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_path, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const authentication = authenticateEmployee("employee-1", "1234");
    const rejection = expect(authentication).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(restoreOperatorSession()).toBeNull();
    vi.useRealTimers();
  });

  it("reissues a session for the same tab and reads the server identity with explicit token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ token: "new-token", expires_at: expires }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ employee_id: "employee-1", employee_code: "A", employee_name: "Worker",
        tab_id: "tab-1", expires_at: expires }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await issueSession("employee-1", "4321");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operator-sessions");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ employee_id: "employee-1", pin: "4321",
      tab_id: session.tab_id });
    const current = await readOperatorSession();
    expect(current.employee_id).toBe("employee-1");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Operator-Session")).toBe("new-token");
  });

  it("clears locally and exposes uncertain server revocation on network loss", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ token: "secret-token", expires_at: expires }, { status: 201 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await issueSession("employee-1", "4321");
    const result = await revokeOperatorSession();
    expect(result.status).toBe("uncertain");
    expect(restoreOperatorSession()).toBeNull();
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Operator-Session")).toBe("secret-token");
  });

  it("clears locally after confirmed 204 revocation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ token: "secret-token", expires_at: expires }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await issueSession("employee-1", "4321");
    expect(await revokeOperatorSession()).toMatchObject({ status: "revoked" });
    expect(restoreOperatorSession()).toBeNull();
  });

  it("does not erase a new login when an older revocation finishes later", async () => {
    let finishRevocation!: (response: Response) => void;
    const pendingRevocation = new Promise<Response>((resolve) => { finishRevocation = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: "old-token", expires_at: expires }, { status: 201 }))
      .mockReturnValueOnce(pendingRevocation)
      .mockResolvedValueOnce(Response.json({ token: "new-token", expires_at: expires }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await issueSession("employee-1", "1111");

    const revocation = revokeOperatorSession();
    expect(restoreOperatorSession()).toBeNull();
    const replacement = await issueSession("employee-2", "2222");
    finishRevocation(new Response(null, { status: 204 }));

    expect(await revocation).toMatchObject({ status: "revoked" });
    expect(restoreOperatorSession("employee-2")).toEqual(replacement);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-Operator-Session")).toBe("old-token");
    expect(fetchMock.mock.calls[1][1].keepalive).toBe(true);
  });

  it("rejects a cloned document's copied token without revoking the original", async () => {
    class FakeChannel {
      static peers: FakeChannel[] = [];
      static sent: unknown[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(public name: string) { FakeChannel.peers.push(this); }
      postMessage(data: unknown) {
        FakeChannel.sent.push(data);
        for (const peer of FakeChannel.peers) {
          if (peer !== this && peer.name === this.name) queueMicrotask(() => peer.onmessage?.({ data } as MessageEvent));
        }
      }
      close() { FakeChannel.peers = FakeChannel.peers.filter((peer) => peer !== this); }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ token: "original-token", expires_at: expires }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const original = await issueSession("employee-1", "1234");
    expect(await validateTabOwnership()).toBe(true);

    vi.resetModules();
    const clonedDocument = await import("../operator-session");
    expect(FakeChannel.peers).toHaveLength(1);
    const owned = await clonedDocument.validateTabOwnership();
    expect(FakeChannel.sent).toMatchObject([{ type: "probe" }, { type: "owned" }]);
    expect(owned).toBe(false);
    expect(clonedDocument.restoreOperatorSession()).toBeNull();
    expect(window.sessionStorage.getItem("dexcowin_mes_operator_tab_id")).not.toBe(original.tab_id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed after reload when BroadcastChannel is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ token: "cached-token", expires_at: expires }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await issueSession("employee-1", "1234");
    vi.resetModules();
    const newDocument = await import("../operator-session");
    expect(await newDocument.validateTabOwnership()).toBe(false);
    expect(newDocument.restoreOperatorSession()).toBeNull();
  });

  it("rotates a copied tab before issuing a replacement session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: "copied-token", expires_at: expires }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ token: "new-token", expires_at: expires }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const copied = await issueSession("employee-1", "1234");
    vi.resetModules();
    const clonedDocument = await import("../operator-session");

    const replacement = await clonedDocument.issueSession("employee-1", "1234");
    expect(replacement.tab_id).not.toBe(copied.tab_id);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tab_id).toBe(replacement.tab_id);
  });

  it("rotates a copied tab before combined PIN authentication", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: "copied-token", expires_at: expires }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ employee: { employee_id: "employee-1" },
        operator_session: { token: "new-token", expires_at: expires } }));
    vi.stubGlobal("fetch", fetchMock);
    const copied = await issueSession("employee-1", "1234");
    vi.resetModules();
    const clonedDocument = await import("../operator-session");

    const replacement = await clonedDocument.authenticateEmployee("employee-1", "1234");
    expect(replacement.session.tab_id).not.toBe(copied.tab_id);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tab_id).toBe(replacement.session.tab_id);
  });

  it("does not reuse a copied tab ID when its bearer was already removed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: "old-token", expires_at: expires }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ token: "new-token", expires_at: expires }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const original = await issueSession("employee-1", "1234");
    window.sessionStorage.removeItem("dexcowin_mes_operator_session");
    vi.resetModules();
    const clonedDocument = await import("../operator-session");

    const replacement = await clonedDocument.issueSession("employee-1", "1234");
    expect(replacement.tab_id).not.toBe(original.tab_id);
  });
});
