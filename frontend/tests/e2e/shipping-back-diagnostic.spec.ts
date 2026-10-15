/** Temporary observation-only reproduction; parent owns execution and removal. */
import { test, expect, loginUi } from "./_common-expectations";

test("SHIPPING-BACK-DIAG native Back listener/history/DOM order", async ({ page, actors }, testInfo) => {
  const records: unknown[] = [];
  page.on("console", (message) => {
    if (!message.text().startsWith("SHIP_NAV_DIAG ")) return;
    try { records.push(JSON.parse(message.text().slice("SHIP_NAV_DIAG ".length))); } catch { records.push(message.text()); }
  });
  await page.addInitScript(() => {
    const documentId = `${Date.now()}-${Math.random()}`;
    let sequence = 0;
    const snapshot = () => ({
      url: location.href, historyLength: history.length, historyKeys: Object.keys(history.state ?? {}),
      invoice: (document.querySelector('[data-testid="shipping-invoice-number"]') as HTMLInputElement | null)?.value ?? null,
      wizard: Boolean(document.querySelector('[data-testid="shipping-wizard-step-1"]')),
      list: Boolean(document.querySelector('[data-testid="shipping-request-list-panel"]')),
      dialog: [...document.querySelectorAll('[role="dialog"]')].map((element) => element.textContent?.slice(0, 150)),
      tab: document.querySelector('[data-testid="desktop-tab-transition"]')?.getAttribute("data-active-tab"),
    });
    const log = (event: string, extra: Record<string, unknown> = {}) => {
      if (sequence >= 1200) return;
      console.debug("SHIP_NAV_DIAG " + JSON.stringify({ documentId, sequence: sequence++, at: performance.now(), event, ...snapshot(), ...extra }));
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const wrappers = new WeakMap<EventListenerOrEventListenerObject, Map<boolean, EventListener>>();
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this !== window || type !== "popstate" || !listener) return add.call(this, type, listener, options);
      const capture = typeof options === "boolean" ? options : !!options?.capture;
      let versions = wrappers.get(listener);
      if (!versions) { versions = new Map(); wrappers.set(listener, versions); }
      let wrapped = versions.get(capture);
      if (!wrapped) {
        const source = String(listener).slice(0, 700);
        wrapped = function (this: EventTarget, event) {
          log("listener-before", { capture, source });
          try {
            if (typeof listener === "function") listener.call(this, event);
            else listener.handleEvent(event);
          } finally { log("listener-after", { capture, source }); }
        };
        versions.set(capture, wrapped);
      }
      log("listener-register", { capture, source: String(listener).slice(0, 700) });
      return add.call(this, type, wrapped, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (this !== window || type !== "popstate") return remove.call(this, type, listener, options);
      const capture = typeof options === "boolean" ? options : !!options?.capture;
      const wrapped = listener && wrappers.get(listener)?.get(capture);
      if (this === window && type === "popstate") log("listener-remove", { capture, source: String(listener).slice(0, 700) });
      return remove.call(this, type, wrapped ?? listener, options);
    };
    for (const method of ["pushState", "replaceState"] as const) {
      const native = history[method];
      history[method] = function (...args: Parameters<History[typeof method]>) {
        log(`${method}-before`, { destination: String(args[2]), incomingKeys: Object.keys(args[0] ?? {}), stack: new Error().stack?.split("\n").slice(1, 5) });
        const result = native.apply(this, args);
        log(`${method}-after`); return result;
      };
    }
    add.call(window, "popstate", () => {
      log("native-capture"); queueMicrotask(() => log("native-microtask"));
      requestAnimationFrame(() => { log("native-raf"); requestAnimationFrame(() => log("native-raf2")); });
    }, true);
    for (const event of ["pagehide", "pageshow", "beforeunload"]) add.call(window, event, () => log(event));
    add.call(window, "shipping-diag-checkpoint", (event) => log("checkpoint", { label: (event as CustomEvent).detail }));
    let lastDom = "";
    new MutationObserver(() => {
      const next = JSON.stringify(snapshot());
      if (lastDom !== next) { lastDom = next; log("dom-change"); }
    }).observe(document, { childList: true, subtree: true });
    log("init");
  });
  const checkpoint = (label: string) => page.evaluate((detail) => window.dispatchEvent(new CustomEvent("shipping-diag-checkpoint", { detail })), label);
  try {
    await loginUi(page, actors.requester);
    await page.goto("/mes?tab=shipping");
    await page.getByRole("button").filter({ hasText: "출하 관리", visible: true }).first().click();
    await page.getByRole("button", { name: "새 출하 요청 만들기", exact: true }).click();
    const invoice = page.getByRole("textbox", { name: "인보이스 번호", exact: true });
    await invoice.fill("QA-초안-13"); await expect(page).toHaveURL(/shippingView=requestWork.*shippingStep=1/);
    await checkpoint("draft-filled");
    await page.getByRole("button", { name: /^출하(?:\s|$)/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "계속 머무르기", exact: true }).click(); await checkpoint("same-menu-stayed");
    await page.getByRole("button", { name: /^대시보드(?:\s|$)/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "계속 머무르기", exact: true }).click();
    await expect(invoice).toHaveValue("QA-초안-13"); await checkpoint("before-native-back");
    await page.goBack(); await checkpoint("after-native-back-resolved");
    await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
    await checkpoint("guard-visible");
  } finally {
    await checkpoint("test-final").catch(() => {});
    await testInfo.attach("shipping-native-history-order", { body: JSON.stringify(records, null, 2), contentType: "application/json" });
  }
});
