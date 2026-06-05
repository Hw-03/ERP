"use client";

import { useEffect, useRef } from "react";

type Args = {
  step1Done: boolean;
  step2Done: boolean;
  forcedStep: 1 | 2 | null;
  lastResult: { count: number; label: string } | null;
};

export function useWarehouseScroll({ step1Done, step2Done, forcedStep, lastResult }: Args) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);
  const prevStep1DoneRef = useRef(false);
  const prevStep2DoneRef = useRef(false);
  const prevForcedStepRef = useRef<1 | 2 | null>(null);
  const prevLastResultRef = useRef<{ count: number; label: string } | null>(null);

  function scrollToRef(ref: React.RefObject<HTMLDivElement>, delay = 150) {
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, delay);
  }

  useEffect(() => {
    if (step1Done && !prevStep1DoneRef.current) scrollToRef(step2Ref);
    prevStep1DoneRef.current = step1Done;
  }, [step1Done]);

  useEffect(() => {
    if (step2Done && !prevStep2DoneRef.current) scrollToRef(step3Ref);
    prevStep2DoneRef.current = step2Done;
  }, [step2Done]);

  useEffect(() => {
    if (lastResult && lastResult !== prevLastResultRef.current) {
      scrollToRef(step2Ref, 200);
    }
    prevLastResultRef.current = lastResult;
  }, [lastResult]);

  useEffect(() => {
    if (forcedStep === 1 && prevForcedStepRef.current !== 1) scrollToRef(step1Ref);
    if (forcedStep === 2 && prevForcedStepRef.current !== 2) scrollToRef(step2Ref);
    prevForcedStepRef.current = forcedStep;
  }, [forcedStep]);

  return {
    scrollRootRef,
    step1Ref,
    step2Ref,
    step3Ref,
    step4Ref,
  };
}
