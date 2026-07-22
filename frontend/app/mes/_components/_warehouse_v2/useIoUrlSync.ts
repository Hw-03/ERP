/**
 * URL ?step=N 양방향 동기화 effect 추출.
 *
 * IoComposeView 에 인라인이던 router.push / urlStep → state.goTo 두 effect 를
 * 그대로 옮긴 것. 부수효과·실행 시점·의존성 배열은 원본과 동일하다.
 *
 * - state.step → URL push (skipNextPushRef 로 1회 차단 가능)
 * - URL step → state.goTo (도달 불가 step 은 clamp)
 * - pendingFinalStepRef: 중간 단계 history 누락 방지용 deferred target
 *
 * router/searchParams/pathname 은 호출 측이 next/navigation 에서 가져와 주입한다.
 * 테스트에서는 in-memory fake 로 대체 가능.
 */
import { useEffect, useMemo, useRef } from "react";
import type { IoStep } from "./useIoWorkState";

type Router = {
  push: (href: string, opts?: { scroll?: boolean }) => void;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
  toString: () => string;
};

export type UseIoUrlSyncArgs = {
  step: IoStep;
  goTo: (target: IoStep) => void;
  canAdvance: Record<IoStep, boolean>;
  router: Router;
  searchParams: SearchParamsLike;
  pathname: string;
  suppressInitialSync?: boolean;
  /**
   * 지정 시 step push 마다 `tab` 을 이 값으로 강제한다.
   * 대시보드→창고 교차 진입 순간 React searchParams 가 아직 직전 탭(tab=dashboard)으로
   * lagging 상태라, 이를 보존하면 셸의 URL→activeTab 동기화가 대시보드로 되돌린다(튕김).
   * 위저드는 항상 창고 탭 아래에서만 렌더되므로 "warehouse" 로 고정하면 타이밍과 무관하게 안전.
   */
  tabParam?: string;
};

export type UseIoUrlSyncApi = {
  /**
   * Step 3 (bundles>0 로 Step 4 가 동시 노출된 상태) 에서 곧장 5 로 점프하면
   * URL history 에 step=4 가 안 쌓여 뒤로 가기가 step=3 으로 떨어진다.
   * 이 ref 에 5 를 예약해두면 먼저 goTo(4) → URL 갱신 후 자동으로 goTo(5) 호출.
   */
  pendingFinalStepRef: React.MutableRefObject<IoStep | null>;
};

export function useIoUrlSync(args: UseIoUrlSyncArgs): UseIoUrlSyncApi {
  const { step, goTo, canAdvance, router, searchParams, pathname, tabParam, suppressInitialSync = false } = args;

  const urlStep = useMemo<IoStep>(() => {
    const raw = Number(searchParams.get("step"));
    return raw >= 1 && raw <= 5 ? (raw as IoStep) : 1;
  }, [searchParams]);

  // URL→state 동기화 직후 state→URL effect 가 다시 push 하는 것을 1회 차단.
  const skipNextPushRef = useRef(false);
  const suppressInitialSyncRef = useRef(suppressInitialSync);
  const forceInitialStepPushRef = useRef(false);
  // step 을 2 단계 이상 점프할 때(예: 3 → 5) 중간 단계도 history 에 쌓기 위한 deferred target.
  const pendingFinalStepRef = useRef<IoStep | null>(null);

  // state.step 변경 → URL push
  useEffect(() => {
    if (suppressInitialSyncRef.current) {
      if (step === 1) return;
      suppressInitialSyncRef.current = false;
      forceInitialStepPushRef.current = true;
    }
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const forceInitialStepPush = forceInitialStepPushRef.current;
    if (!forceInitialStepPush && urlStep === step) return;
    const next = new URLSearchParams(
      forceInitialStepPush && typeof window !== "undefined"
        ? window.location.search
        : searchParams.toString(),
    );
    next.set("step", String(step));
    // lagged searchParams 로 인한 stale tab 보존을 차단 — 위저드가 속한 탭으로 고정.
    if (tabParam) next.set("tab", tabParam);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
    forceInitialStepPushRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // URL step 변경 (뒤로/앞으로) → state.goTo (도달 불가 step 은 clamp)
  useEffect(() => {
    if (suppressInitialSyncRef.current) return;
    if (urlStep === step) {
      // URL 이 state 를 따라잡았을 때 — 보류된 다음 단계가 있으면 advance.
      if (pendingFinalStepRef.current != null && pendingFinalStepRef.current !== step) {
        const target = pendingFinalStepRef.current;
        pendingFinalStepRef.current = null;
        goTo(target);
      }
      return;
    }
    let target: IoStep = urlStep;
    for (let s = 1; s < target; s += 1) {
      if (!canAdvance[s as IoStep]) {
        target = s as IoStep;
        break;
      }
    }
    // URL 으로 들어온 변경은 pending 을 취소 (사용자가 뒤로/앞으로 누른 경우 자동 advance 중단).
    pendingFinalStepRef.current = null;
    skipNextPushRef.current = true;
    goTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStep]);

  return { pendingFinalStepRef };
}
