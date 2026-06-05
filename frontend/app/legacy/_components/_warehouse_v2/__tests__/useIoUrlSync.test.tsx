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
import { renderHook, act } from "@testing-library/react";
import { useIoUrlSync } from "../useIoUrlSync";
import type { IoStep } from "../useIoWorkState";

function makeSearchParams(query: string) {
  const usp = new URLSearchParams(query);
  return {
    get: (key: string) => usp.get(key),
    toString: () => usp.toString(),
  };
}

const ALL_TRUE: Record<IoStep, boolean> = { 1: true, 2: true, 3: true, 4: true, 5: true };

describe("useIoUrlSync", () => {
  it("state.step 이 URL 과 다르면 router.push 로 ?step=N 갱신", () => {
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
    rerender({ searchParams: makeSearchParams("step=3") });
    expect(goTo).toHaveBeenCalledWith(3);
  });

  it("도달 불가 step 은 마지막 통과 가능 step 으로 clamp", () => {
    const goTo = vi.fn();
    // step=3 으로 점프 시도하지만 canAdvance[2]=false → 2 로 clamp
    const canAdvance: Record<IoStep, boolean> = { 1: true, 2: false, 3: true, 4: true, 5: true };
    const { rerender } = renderHook(
      ({ searchParams }: { searchParams: ReturnType<typeof makeSearchParams> }) =>
        useIoUrlSync({
          step: 1 as IoStep,
          goTo,
          canAdvance,
          router: { push: vi.fn() },
          searchParams,
          pathname: "/wh",
        }),
      { initialProps: { searchParams: makeSearchParams("step=1") } },
    );

    rerender({ searchParams: makeSearchParams("step=3") });
    expect(goTo).toHaveBeenCalledWith(2);
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
    rerender({ step: 4 as IoStep, searchParams: makeSearchParams("step=4") });

    expect(goTo).toHaveBeenCalledWith(5);
    expect(pendingRef!.current).toBeNull();
  });
});
