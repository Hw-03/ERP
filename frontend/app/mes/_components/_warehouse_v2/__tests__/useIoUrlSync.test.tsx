/**
 * useIoUrlSync 단위 테스트.
 *
 * IoComposeView 에서 추출한 URL ?step=N 양방향 동기화 hook 의 동작을 격리 검증한다.
 * - state.step 변경 → router.push("?step=N")
 * - URL step 변경 → goTo 호출 (canAdvance 막힌 step 은 clamp)
 * - 같은 step 으로 들어온 URL 은 무시 (재귀 push 방지)
 * - pendingFinalStepRef 가 채워져 있으면 URL 따라잡힌 직후 자동 goTo
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useIoUrlSync } from "../useIoUrlSync";
import { useIoWorkState, type IoStep } from "../useIoWorkState";

function makeSearchParams(query: string) {
  const usp = new URLSearchParams(query);
  return {
    get: (key: string) => usp.get(key),
    toString: () => usp.toString(),
  };
}

const ALL_TRUE: Record<IoStep, boolean> = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };

describe("PC native history", () => {
  function mountPc(options: { canAdvance?: Record<IoStep, boolean>; suppressInitialSync?: boolean } = {}) {
    return renderHook(() => {
      const state = useIoWorkState();
      const sync = useIoUrlSync({
        step: state.step, steps: state.steps, goTo: state.goTo, canAdvance: options.canAdvance ?? state.canAdvance,
        router: { push: vi.fn() }, searchParams: makeSearchParams("tab=warehouse&step=1"),
        pathname: "/mes", tabParam: "warehouse", synchronousHistory: true,
        suppressInitialSync: options.suppressInitialSync,
      });
      return { state, sync };
    });
  }

  it("stale query를 둔 실제 뒤로/앞으로 왕복은 현재 작업을 보존한다", async () => {
    window.history.replaceState({ unrelated: "keep", __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }, "", "/mes?tab=warehouse&step=1");
    const historyPush = vi.spyOn(window.history, "pushState");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("process"); result.current.state.goTo(2); });
    expect(result.current.state.step).toBe(2);
    const pushes = historyPush.mock.calls.length;
    await act(async () => { window.history.back(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    await waitFor(() => expect(result.current.state.step).toBe(1));
    expect(result.current.state.workType).toBe("process");
    await act(async () => { window.history.forward(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    await waitFor(() => expect(result.current.state.step).toBe(2));
    expect(historyPush.mock.calls.length).toBe(pushes);
    expect(historyPush.mock.calls[0]?.[0]).toMatchObject({ unrelated: "keep" });
    expect(historyPush.mock.calls[0]?.[0]?.__NA).toBeUndefined();
    expect(historyPush.mock.calls[0]?.[0]?._N).toBeUndefined();
    expect(historyPush.mock.calls[0]?.[0]?.__PRIVATE_NEXTJS_INTERNALS_TREE).toBeUndefined();
    historyPush.mockRestore();
  });

  it("빠르게 Back/Forward하면 마지막 live URL 단계를 따르고 추가 push하지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("process"); result.current.state.goTo(2); });
    const currentEntry = window.history.state;
    const push = vi.spyOn(window.history, "pushState");
    act(() => {
      window.history.replaceState(currentEntry, "", "/mes?tab=warehouse&step=1");
      window.dispatchEvent(new PopStateEvent("popstate", { state: currentEntry }));
      window.history.replaceState(currentEntry, "", "/mes?tab=warehouse&step=2");
      window.dispatchEvent(new PopStateEvent("popstate", { state: currentEntry }));
    });
    expect(result.current.state.step).toBe(2);
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("도달 불가 live URL은 엔트리 추가 없이 replace로 보정한다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("process"); result.current.state.goTo(2); });
    const entry = window.history.state;
    const push = vi.spyOn(window.history, "pushState");
    act(() => {
      window.history.replaceState(entry, "", "/mes?tab=warehouse&step=5");
      window.dispatchEvent(new PopStateEvent("popstate", { state: entry }));
    });
    expect(result.current.state.step).toBe(2);
    expect(new URLSearchParams(window.location.search).get("step")).toBe("2");
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("새 작업 시작은 live draft를 제거한 1단계 anchor 이후 한 번만 첫 단계를 기록한다", () => {
    window.history.replaceState({ unrelated: "keep" }, "", "/mes?tab=warehouse&section=compose&step=1&draftId=previous&filter=open#work");
    const { result } = mountPc();
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    act(() => {
      result.current.state.setWorkType("process");
      result.current.sync.beginWork(2);
      expect(new URLSearchParams(window.location.search).get("step")).toBe("2");
    });
    expect(replace.mock.calls[0]?.[2]).toBe("/mes?tab=warehouse&section=compose&step=1&filter=open#work");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toMatchObject({ unrelated: "keep", ioComposition: expect.any(String) });
    expect(push.mock.calls[0]?.[0]?.bundles).toBeUndefined();
    expect(window.location.hash).toBe("#work");
    push.mockRestore(); replace.mockRestore();
  });

  it("원자재의 1→6→2 history 왕복은 선택과 현재 묶음을 보존한다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("receive"); result.current.sync.beginWork(6); });
    const bundles = [{ bundle_id: "kept-bundle", quantity: 1, lines: [] }] as never;
    act(() => {
      result.current.state.setSubType("outbound_supplier");
      result.current.state.setBundles(bundles);
      result.current.state.goTo(2);
    });
    await act(async () => { window.history.back(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(6);
    expect(result.current.state.subType).toBe("outbound_supplier");
    expect(result.current.state.bundles).toEqual(bundles);
    await act(async () => { window.history.back(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(1);
    expect(result.current.state.bundles).toEqual(bundles);
    await act(async () => { window.history.forward(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(6);
    await act(async () => { window.history.forward(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(2);
    expect(result.current.state.subType).toBe("outbound_supplier");
    expect(result.current.state.bundles).toEqual(bundles);
  });

  it("이전 작업 토큰의 단계로 돌아가면 새 작업 내용으로 해당 단계를 열지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("process"); result.current.sync.beginWork(2); });
    const previous = window.history.state;
    act(() => { result.current.state.setWorkType("receive"); result.current.sync.beginWork(6); });
    const currentToken = window.history.state.ioComposition;
    act(() => {
      window.history.replaceState(previous, "", "/mes?tab=warehouse&step=2&draftId=previous");
      window.dispatchEvent(new PopStateEvent("popstate", { state: previous }));
    });
    expect(result.current.state.step).toBe(1);
    expect(result.current.state.workType).toBe("receive");
    expect(new URLSearchParams(window.location.search).get("step")).toBe("1");
    expect(new URLSearchParams(window.location.search).get("draftId")).toBeNull();
    expect(window.history.state.ioComposition).toBe(currentToken);
  });

  it("작업 토큰 없는 이전 entry도 현재 선택 유형의 단계로 해석하지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc();
    act(() => { result.current.state.setWorkType("process"); result.current.sync.beginWork(2); });
    act(() => {
      window.history.replaceState({ unrelated: "keep" }, "", "/mes?tab=warehouse&step=2");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    expect(result.current.state.step).toBe(1);
    expect(new URLSearchParams(window.location.search).get("step")).toBe("1");
    expect(window.history.state.unrelated).toBe("keep");
  });

  it("PC 3→4→5 예약 진행은 frozen query에서도 중간 4단계 Back을 보존한다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&step=1");
    const { result } = mountPc({ canAdvance: ALL_TRUE });
    act(() => { result.current.state.setWorkType("process"); result.current.sync.beginWork(3); });
    const push = vi.spyOn(window.history, "pushState");
    act(() => {
      result.current.sync.pendingFinalStepRef.current = 5;
      result.current.state.goTo(4);
    });
    expect(result.current.state.step).toBe(5);
    expect(push.mock.calls.map((call) => new URL(String(call[2]), window.location.origin).searchParams.get("step"))).toEqual(["4", "5"]);
    await act(async () => { window.history.back(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(4);
    expect(result.current.sync.pendingFinalStepRef.current).toBeNull();
    expect(push).toHaveBeenCalledTimes(2);
    push.mockRestore();
  });

  it("초기 초안 복원은 1단계 anchor를 만들고 Forward에서 복원 단계와 내용을 유지한다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=saved-draft");
    const { result } = mountPc({ canAdvance: ALL_TRUE, suppressInitialSync: true });
    expect(new URLSearchParams(window.location.search).get("step")).toBe("4");
    const bundles = [{ bundle_id: "restored-bundle", quantity: 1, lines: [] }] as never;
    act(() => {
      result.current.state.setWorkType("warehouse_io");
      result.current.state.setSubType("warehouse_to_dept");
      result.current.state.setBundles(bundles);
      result.current.state.goTo(4);
    });
    expect(result.current.state.step).toBe(4);
    await act(async () => { window.history.back(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(1);
    expect(result.current.state.bundles).toEqual(bundles);
    await act(async () => { window.history.forward(); await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true })); });
    expect(result.current.state.step).toBe(4);
    expect(result.current.state.bundles).toEqual(bundles);
    expect(new URLSearchParams(window.location.search).get("draftId")).toBe("saved-draft");
  });
});

describe("useIoUrlSync", () => {
  it("원자재 URL의 기존 공급업체 단계 전에 방향 선택을 검증한다", () => {
    window.history.replaceState(null, "", "/wh?step=2");
    const goTo = vi.fn();
    renderHook(() => useIoUrlSync({
      step: 1, steps: [1, 6, 2, 3, 4, 5], goTo,
      canAdvance: { ...ALL_TRUE, 6: false }, router: { push: vi.fn() },
      searchParams: makeSearchParams("step=2"), pathname: "/wh",
    }));
    expect(goTo).toHaveBeenCalledWith(6);
  });

  it("원자재 방향 선택 URL을 기록하고 뒤로가기로 복원한다", () => {
    window.history.replaceState(null, "", "/wh?step=6");
    const goTo = vi.fn();
    renderHook(() => useIoUrlSync({
      step: 2, steps: [1, 6, 2, 3, 4, 5], goTo,
      canAdvance: ALL_TRUE, router: { push: vi.fn() },
      searchParams: makeSearchParams("step=6"), pathname: "/wh",
    }));
    expect(goTo).toHaveBeenCalledWith(6);
  });

  it("PC 첫 화면 재마운트에서 이전 URL 스냅샷으로 step=1을 추가하지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const historyPush = vi.spyOn(window.history, "pushState");
    renderHook(() => useIoUrlSync({ step: 1, goTo: vi.fn(), canAdvance: ALL_TRUE, router: { push: vi.fn() }, synchronousHistory: true, searchParams: makeSearchParams("tab=warehouse&step=5"), pathname: "/mes" }));
    expect(historyPush).not.toHaveBeenCalled();
    historyPush.mockRestore();
  });
  it("PC 단계 기록은 즉시 반영하고 복귀 후 지연된 단계 스냅샷을 무시한다", () => {
    window.history.replaceState({ unrelated: "keep" }, "", "/mes?tab=warehouse");
    const push = vi.fn();
    const goTo = vi.fn();
    const { result, rerender } = renderHook(({ step, query }: { step: IoStep; query: string }) => useIoUrlSync({
      step, goTo, canAdvance: ALL_TRUE, router: { push }, synchronousHistory: true,
      searchParams: makeSearchParams(query), pathname: "/mes",
    }), { initialProps: { step: 1 as IoStep, query: "tab=warehouse" } });
    rerender({ step: 2, query: "tab=warehouse" });
    expect(window.location.search).toBe("?tab=warehouse&step=2");
    expect(window.history.state.unrelated).toBe("keep");
    act(() => {
      result.current.resetForHome();
      window.history.pushState(window.history.state, "", "/mes?tab=warehouse");
    });
    rerender({ step: 1, query: "tab=warehouse&step=2" });
    expect(window.location.search).toBe("?tab=warehouse");
    expect(goTo).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
  it("첫 단계의 품목 전환 복귀 후 다음 작업의 URL 갱신을 막지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const push = vi.fn();
    const { result, rerender } = renderHook(({ step }: { step: IoStep }) => useIoUrlSync({
      step, goTo: vi.fn(), canAdvance: ALL_TRUE, router: { push },
      searchParams: makeSearchParams("tab=warehouse"), pathname: "/mes",
    }), { initialProps: { step: 1 as IoStep } });
    act(() => result.current.resetForHome());
    rerender({ step: 2 });
    expect(push).toHaveBeenCalledWith("/mes?tab=warehouse&step=2", { scroll: false });
  });
  it("새 작업 진입에서는 URL step만으로 작업 유형 선택을 건너뛰지 않는다", () => {
    window.history.replaceState(null, "", "/wh?step=5");
    const push = vi.fn();

    const { result } = renderHook(() => {
      const state = useIoWorkState();
      useIoUrlSync({
        step: state.step,
        goTo: state.goTo,
        canAdvance: state.canAdvance,
        router: { push },
        searchParams: makeSearchParams("step=5"),
        pathname: "/wh",
      });
      return state;
    });

    expect(result.current.step).toBe(1);
    expect(result.current.hasSelectedWorkType).toBe(false);
    expect(push).toHaveBeenCalledWith("/wh?step=1", { scroll: false });
  });

  it("clamp한 URL 반영이 늦어도 이미 진행한 작업 단계를 되돌리지 않는다", () => {
    window.history.replaceState(null, "", "/wh?step=5");
    const push = vi.fn((href: string) => {
      window.history.pushState(null, "", href);
    });
    const { result, rerender } = renderHook(
      ({ searchParams }: { searchParams: ReturnType<typeof makeSearchParams> }) => {
        const state = useIoWorkState();
        useIoUrlSync({
          step: state.step,
          goTo: state.goTo,
          canAdvance: state.canAdvance,
          router: { push },
          searchParams,
          pathname: "/wh",
        });
        return state;
      },
      { initialProps: { searchParams: makeSearchParams("step=5") } },
    );

    expect(result.current.step).toBe(1);
    act(() => {
      result.current.setWorkType("process");
      result.current.goTo(2);
    });
    expect(result.current.step).toBe(2);

    rerender({ searchParams: makeSearchParams("step=1") });

    expect(result.current.step).toBe(2);
    expect(window.location.search).toBe("?step=2");
  });

  it("state.step 이 URL 과 다르면 router.push 로 ?step=N 갱신", () => {
    window.history.replaceState(null, "", "/wh?step=1");
    const push = vi.fn();
    const router = { push };
    const { rerender } = renderHook(
      ({ step }: { step: IoStep }) =>
        useIoUrlSync({
          step,
          goTo: vi.fn(),
          canAdvance: ALL_TRUE,
          router,
          searchParams: makeSearchParams("step=1"),
          pathname: "/wh",
        }),
      { initialProps: { step: 1 as IoStep } },
    );

    // 초기 마운트 — urlStep=1=state.step → push 없음
    expect(push).not.toHaveBeenCalled();

    // step 변경 → push
    rerender({ step: 3 as IoStep });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/wh?step=3", { scroll: false });
  });

  it("URL step 이 state 보다 앞서면 goTo 호출", () => {
    window.history.replaceState(null, "", "/wh?step=1");
    const goTo = vi.fn();
    const { rerender } = renderHook(
      ({ searchParams }: { searchParams: ReturnType<typeof makeSearchParams> }) =>
        useIoUrlSync({
          step: 1 as IoStep,
          goTo,
          canAdvance: ALL_TRUE,
          router: { push: vi.fn() },
          searchParams,
          pathname: "/wh",
        }),
      { initialProps: { searchParams: makeSearchParams("step=1") } },
    );

    expect(goTo).not.toHaveBeenCalled();

    // 뒤로/앞으로 → URL ?step=3
    window.history.replaceState(null, "", "/wh?step=3");
    rerender({ searchParams: makeSearchParams("step=3") });
    expect(goTo).toHaveBeenCalledWith(3);
  });

  it("도달 불가 step 은 마지막 통과 가능 step 으로 clamp", () => {
    window.history.replaceState(null, "", "/wh?step=1");
    const goTo = vi.fn();
    const push = vi.fn();
    // step=3 으로 점프 시도하지만 canAdvance[2]=false → 2 로 clamp
    const canAdvance: Record<IoStep, boolean> = { 1: true, 2: false, 3: true, 4: true, 5: true };
    const { rerender } = renderHook(
      ({ searchParams }: { searchParams: ReturnType<typeof makeSearchParams> }) =>
        useIoUrlSync({
          step: 1 as IoStep,
          goTo,
          canAdvance,
          router: { push },
          searchParams,
          pathname: "/wh",
        }),
      { initialProps: { searchParams: makeSearchParams("step=1") } },
    );

    window.history.replaceState(null, "", "/wh?step=3");
    rerender({ searchParams: makeSearchParams("step=3") });
    expect(goTo).toHaveBeenCalledWith(2);
    expect(push).toHaveBeenCalledWith("/wh?step=2", { scroll: false });
  });

  it("urlStep === state.step 이면 goTo 호출 없음 (재귀 차단)", () => {
    const goTo = vi.fn();
    renderHook(() =>
      useIoUrlSync({
        step: 2 as IoStep,
        goTo,
        canAdvance: ALL_TRUE,
        router: { push: vi.fn() },
        searchParams: makeSearchParams("step=2"),
        pathname: "/wh",
      }),
    );
    expect(goTo).not.toHaveBeenCalled();
  });

  it("pendingFinalStepRef 가 채워지면 URL 따라잡힌 직후 자동 goTo", () => {
    window.history.replaceState(null, "", "/wh?step=3");
    const goTo = vi.fn();
    let pendingRef: React.MutableRefObject<IoStep | null> | null = null;
    const { rerender } = renderHook(
      ({ step, searchParams }: { step: IoStep; searchParams: ReturnType<typeof makeSearchParams> }) => {
        const api = useIoUrlSync({
          step,
          goTo,
          canAdvance: ALL_TRUE,
          router: { push: vi.fn() },
          searchParams,
          pathname: "/wh",
        });
        pendingRef = api.pendingFinalStepRef;
        return api;
      },
      { initialProps: { step: 4 as IoStep, searchParams: makeSearchParams("step=3") } },
    );

    // 사용자가 step=3 에서 5 로 점프 — 먼저 4 로 보낸 뒤 5 예약.
    act(() => {
      pendingRef!.current = 5 as IoStep;
    });

    // URL 이 4 로 따라잡힘
    window.history.replaceState(null, "", "/wh?step=4");
    rerender({ step: 4 as IoStep, searchParams: makeSearchParams("step=4") });

    expect(goTo).toHaveBeenCalledWith(5);
    expect(pendingRef!.current).toBeNull();
  });

  it("skips a stale URL step while a draft restore initializes", () => {
    window.history.replaceState(null, "", "/wh?tab=warehouse");
    const goTo = vi.fn();
    const push = vi.fn();
    const { rerender } = renderHook(
      ({ step }: { step: IoStep }) =>
        useIoUrlSync({
          step,
          goTo,
          canAdvance: ALL_TRUE,
          router: { push },
          searchParams: makeSearchParams("tab=warehouse&step=4"),
          pathname: "/wh",
          suppressInitialSync: true,
        }),
      { initialProps: { step: 1 as IoStep } },
    );

    expect(goTo).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    rerender({ step: 4 as IoStep });

    expect(goTo).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/wh?tab=warehouse&step=4", { scroll: false });
  });

  it("실제 URL에서 제거된 제출 완료 draftId를 지연된 searchParams로 되살리지 않는다", () => {
    window.history.replaceState(null, "", "/wh?tab=warehouse&section=compose&step=5");
    const push = vi.fn();
    const staleSearchParams = makeSearchParams(
      "tab=warehouse&section=compose&step=5&draftId=submitted-draft",
    );
    const { rerender } = renderHook(
      ({ step }: { step: IoStep }) =>
        useIoUrlSync({
          step,
          goTo: vi.fn(),
          canAdvance: ALL_TRUE,
          router: { push },
          searchParams: staleSearchParams,
          pathname: "/wh",
          tabParam: "warehouse",
        }),
      { initialProps: { step: 5 as IoStep } },
    );

    rerender({ step: 1 as IoStep });

    expect(push).toHaveBeenCalledWith(
      "/wh?tab=warehouse&section=compose&step=1",
      { scroll: false },
    );
  });
});
